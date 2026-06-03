FROM mcr.microsoft.com/dotnet/sdk:8.0

# Install Node.js 20 on top of the .NET SDK image
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install PAC CLI for Linux via Microsoft.PowerApps.CLI NuGet package.
# The nupkg is a zip — we list its contents then copy the linux binary.
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/* \
    && PAC_VER=$(curl -fsSL https://api.nuget.org/v3-flatcontainer/microsoft.powerapps.cli/index.json \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['versions'][-1])") \
    && echo "Installing PAC CLI ${PAC_VER}" \
    && curl -fsSL \
        "https://api.nuget.org/v3-flatcontainer/microsoft.powerapps.cli/${PAC_VER}/microsoft.powerapps.cli.${PAC_VER}.nupkg" \
        -o /tmp/pac.nupkg \
    && unzip -q /tmp/pac.nupkg -d /tmp/pac_pkg \
    && echo "=== Package contents ===" && find /tmp/pac_pkg -type f | sort \
    && PACBIN=$(find /tmp/pac_pkg -type f -name "pac" ! -name "*.exe" 2>/dev/null | head -1) \
    && if [ -z "$PACBIN" ]; then \
         echo "ERROR: pac binary not found — see listing above"; exit 1; \
       fi \
    && cp "$PACBIN" /usr/local/bin/pac \
    && chmod +x /usr/local/bin/pac \
    && rm -rf /tmp/pac.nupkg /tmp/pac_pkg

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
