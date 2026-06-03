# Power Platform Pipeline MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes Power Platform Pipeline operations as tools for Copilot Studio agents and any MCP-compatible client.

---

## Features

| Category | Tools |
|---|---|
| **Pipeline Discovery** | `list_pipelines`, `get_pipeline_stages` |
| **Deployments** | `deploy_solution`, `get_deployment_status`, `get_deployment_history` |
| **Approvals** | `list_pending_approvals`, `approve_deployment`, `reject_deployment` |
| **Configuration** | `list_environment_variables`, `set_environment_variable`, `list_connection_references`, `update_connection_reference` |

---

## Architecture

```
Copilot Studio / MCP Client
        │  HTTP (Streamable HTTP transport)
        ▼
  Express HTTP Server  (POST /mcp, GET /mcp SSE, DELETE /mcp)
        │
  McpServer (@modelcontextprotocol/sdk)
        │
  ┌─────┴────────────────────────┐
  │                              │
  Dataverse Web API          PAC CLI
  (Axios + MSAL OAuth2)     (child_process)
```

---

## Prerequisites

1. **Node.js 20+**
2. **PAC CLI** installed and on `PATH` — required for `deploy_solution`. Install via:
   ```sh
   dotnet tool install --global Microsoft.PowerApps.CLI.Tool
   ```
3. **Entra ID App Registration** with:
   - Client credentials (client ID + secret)
   - API permissions: `Dynamics CRM → user_impersonation` (delegated) **or** assigned a system administrator role in the target environment as an application user
   - The same service principal is used for all Dataverse calls AND the `UpdateApprovalStatus` approval action — this is a Microsoft requirement

---

## Setup

### 1. Clone and install

```sh
git clone https://github.com/MattCollins-Jones/power-platform-pipeline-mcp.git
cd power-platform-pipeline-mcp
npm install
```

### 2. Configure environment variables

```sh
cp .env.example .env
# Edit .env with your values
```

| Variable | Description |
|---|---|
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration client secret |
| `AZURE_TENANT_ID` | Entra ID tenant ID |
| `DATAVERSE_URL` | Environment root URL, e.g. `https://yourorg.crm.dynamics.com` |
| `PORT` | Port to listen on (default: `3000`) |

### 3. Authenticate PAC CLI (development)

For local development, authenticate the PAC CLI manually before starting the server:

```sh
pac auth create \
  --kind ServicePrincipal \
  --applicationId $AZURE_CLIENT_ID \
  --clientSecret $AZURE_CLIENT_SECRET \
  --tenant $AZURE_TENANT_ID \
  --environment $DATAVERSE_URL
```

### 4. Build and start

```sh
npm run build
npm start
```

Or for development with hot-reload:
```sh
npm run dev
```

---

## Docker

Build and run with Docker (PAC CLI auth is handled by `docker-entrypoint.sh`):

```sh
docker build -t pp-pipeline-mcp .

docker run -p 3000:3000 \
  -e AZURE_CLIENT_ID=... \
  -e AZURE_CLIENT_SECRET=... \
  -e AZURE_TENANT_ID=... \
  -e DATAVERSE_URL=https://yourorg.crm.dynamics.com \
  pp-pipeline-mcp
```

---

## Azure App Service / Container Apps Deployment

1. Build the Docker image and push to Azure Container Registry (ACR):
   ```sh
   az acr build --registry <your-acr> --image pp-pipeline-mcp:latest .
   ```
2. Create a Container App or App Service instance pointing to the image.
3. Set the four required environment variables as application settings.
4. The `docker-entrypoint.sh` will authenticate PAC CLI on each container start.

> **Tip:** Use [Managed Identity](https://learn.microsoft.com/azure/active-directory/managed-identities-azure-resources/overview) with a federated credential to avoid storing the client secret.

---

## Connecting from Copilot Studio

1. Deploy the server to a publicly accessible HTTPS endpoint (e.g. `https://your-app.azurewebsites.net`).
2. In Copilot Studio, go to **Settings → AI Capabilities → Model Context Protocol**.
3. Add a new MCP server with the URL: `https://your-app.azurewebsites.net/mcp`
4. All 12 tools will be discovered automatically and made available to your agent.

---

## Tool Reference

### `list_pipelines`
Lists all deployment pipelines in the environment. No parameters required.

### `get_pipeline_stages`
| Parameter | Type | Description |
|---|---|---|
| `pipelineId` | `string` | GUID of the pipeline from `list_pipelines` |

### `deploy_solution`
Triggers a PAC CLI deployment. PAC CLI must be authenticated on the server.

| Parameter | Type | Description |
|---|---|---|
| `solutionName` | `string` | Unique name of the solution |
| `stageId` | `string` | Target stage GUID from `get_pipeline_stages` |
| `currentVersion` | `string` | Current version, e.g. `1.0.0.0` |
| `newVersion` | `string` | Version after deploy, e.g. `1.0.0.1` |
| `environment` | `string` | Source environment URL |

### `get_deployment_status`
| Parameter | Type | Description |
|---|---|---|
| `deploymentStageRunId` | `string` | GUID of the stage run |

### `get_deployment_history`
| Parameter | Type | Description |
|---|---|---|
| `stageId` | `string` | Stage GUID to query |
| `solutionName` | `string?` | Optional solution filter |
| `top` | `number?` | Max records (1–50, default 20) |

### `list_pending_approvals`
| Parameter | Type | Description |
|---|---|---|
| `pipelineStageId` | `string?` | Optional stage filter |

### `approve_deployment`
| Parameter | Type | Description |
|---|---|---|
| `deploymentStageRunId` | `string` | Stage run to approve |
| `approvalComments` | `string?` | Optional comments |

### `reject_deployment`
| Parameter | Type | Description |
|---|---|---|
| `deploymentStageRunId` | `string` | Stage run to reject |
| `approvalComments` | `string` | Reason for rejection |

### `list_environment_variables`
| Parameter | Type | Description |
|---|---|---|
| `solutionUniqueName` | `string` | Solution unique name |

### `set_environment_variable`
| Parameter | Type | Description |
|---|---|---|
| `environmentVariableDefinitionId` | `string` | Definition GUID |
| `newValue` | `string` | New value |
| `environmentVariableValueId` | `string?` | Existing value GUID (omit to create) |

### `list_connection_references`
| Parameter | Type | Description |
|---|---|---|
| `solutionUniqueName` | `string` | Solution unique name |

### `update_connection_reference`
| Parameter | Type | Description |
|---|---|---|
| `connectionReferenceId` | `string` | Connection reference GUID |
| `connectionId` | `string` | Target connection ID |

---

## Security Notes

- Store `AZURE_CLIENT_SECRET` in Azure Key Vault and reference it as an App Service secret — never commit it to source control.
- The service principal **must** be added as an Application User in the Power Platform Admin Centre with the appropriate security role for each environment it operates in.
- The `UpdateApprovalStatus` Dataverse action requires the caller to be the service principal that owns the pipeline connection — this server satisfies that requirement automatically.

---

## Project Structure

```
src/
  index.ts              — MCP server entry point, Express HTTP transport
  auth/
    msalClient.ts       — MSAL token acquisition (client credentials)
  clients/
    dataverseClient.ts  — Axios Dataverse Web API client with auth interceptor
    pacCliClient.ts     — child_process wrapper for PAC CLI
  tools/
    pipelines.ts        — list_pipelines, get_pipeline_stages
    deployments.ts      — deploy_solution, get_deployment_status, get_deployment_history
    approvals.ts        — approve_deployment, reject_deployment, list_pending_approvals
    configuration.ts    — env vars, connection references
  types/
    index.ts            — Shared TypeScript interfaces
```
