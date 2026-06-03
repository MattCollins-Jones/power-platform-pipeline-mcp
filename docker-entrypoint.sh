#!/bin/sh
# Authenticate PAC CLI using the service principal before starting the server.
# All four environment variables must be set in the container.
set -e

echo "Authenticating PAC CLI..."
pac auth create \
  --kind ServicePrincipal \
  --applicationId "$AZURE_CLIENT_ID" \
  --clientSecret "$AZURE_CLIENT_SECRET" \
  --tenant "$AZURE_TENANT_ID" \
  --environment "$DATAVERSE_URL"

echo "PAC CLI authenticated. Starting server..."
exec "$@"
