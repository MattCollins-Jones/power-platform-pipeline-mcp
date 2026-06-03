FROM mcr.microsoft.com/dotnet/sdk:8.0

# Install Node.js 20 on top of the .NET SDK image
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install PAC CLI — dotnet is already fully configured in this base image
RUN dotnet tool install --global Microsoft.PowerApps.CLI.Tool
ENV PATH=$PATH:/root/.dotnet/tools

WORKDIR /app

# Install dependencies first (layer cache optimisation)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY dist/ ./dist/

EXPOSE 3000

# Authenticate PAC CLI at startup via environment variables.
# The entrypoint script calls `pac auth create` before starting the server.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
