import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';

let msalClient: ConfidentialClientApplication | null = null;

/**
 * Returns a singleton MSAL ConfidentialClientApplication configured from
 * environment variables. Throws if any required variable is missing.
 */
function getMsalClient(): ConfidentialClientApplication {
  if (msalClient) return msalClient;

  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error(
      'Missing one or more required auth env vars: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID'
    );
  }

  const config: Configuration = {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };

  msalClient = new ConfidentialClientApplication(config);
  return msalClient;
}

/**
 * Acquires an access token for the given OAuth2 scope using the client
 * credentials flow. Tokens are cached and refreshed automatically by MSAL.
 *
 * @param scope - e.g. "https://yourorg.crm.dynamics.com/.default"
 */
export async function getAccessToken(scope: string): Promise<string> {
  const client = getMsalClient();
  const result = await client.acquireTokenByClientCredential({ scopes: [scope] });

  if (!result?.accessToken) {
    throw new Error(`Failed to acquire access token for scope: ${scope}`);
  }

  return result.accessToken;
}

/**
 * Returns the OAuth2 scope for the configured Dataverse environment, derived
 * from the DATAVERSE_URL environment variable.
 */
export function getDataverseScope(): string {
  const url = process.env.DATAVERSE_URL;
  if (!url) throw new Error('DATAVERSE_URL environment variable is not set');
  // Dataverse scopes use the environment root URL with /.default
  return `${url.replace(/\/$/, '')}/.default`;
}
