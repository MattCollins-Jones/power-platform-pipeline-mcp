FROM node:20-slim

# Install PAC CLI prerequisites + the CLI itself
# PAC CLI requires the .NET runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    ca-certificates \
    apt-transport-https \
    && rm -rf /var/lib/apt/lists/*

# Install .NET 8 SDK (required to run `dotnet tool install` for PAC CLI)
RUN wget https://dot.net/v1/dotnet-install.sh -O dotnet-install.sh \
    && chmod +x dotnet-install.sh \
    && ./dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet \
    && rm dotnet-install.sh

# Install PAC CLI as a .NET global tool
RUN dotnet tool install --global Microsoft.PowerApps.CLI.Tool \
    && ln -s /root/.dotnet/tools/pac /usr/local/bin/pac

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
