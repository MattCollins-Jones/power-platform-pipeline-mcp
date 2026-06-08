#!/bin/sh
# Authenticate PAC CLI using the service principal before starting the server.
# All four environment variables must be set in the container.
# Note: --kind flag is deprecated/removed in PAC CLI v2.x; use --applicationId +
# --clientSecret + --tenant which implicitly creates a service principal profile.
set -e

echo "Authenticating PAC CLI..."
pac auth create \
  --applicationId "$AZURE_CLIENT_ID" \
  --clientSecret "$AZURE_CLIENT_SECRET" \
  --tenant "$AZURE_TENANT_ID" \
  --environment "$DATAVERSE_URL" \
  --accept-cleartext-caching

echo "PAC CLI authenticated. Starting server..."
exec "$@"
