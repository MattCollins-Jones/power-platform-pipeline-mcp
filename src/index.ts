import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import { randomUUID } from 'crypto';

import { registerPipelineTools } from './tools/pipelines';
import { registerDeploymentTools } from './tools/deployments';
import { registerApprovalTools } from './tools/approvals';
import { registerConfigurationTools } from './tools/configuration';

// ─── Validate required environment variables ─────────────────────────────────

const REQUIRED_ENV_VARS = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'DATAVERSE_URL'];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ─── Create & configure MCP server ───────────────────────────────────────────

const mcpServer = new McpServer({
  name: 'power-platform-pipeline-mcp',
  version: '1.0.0',
});

registerPipelineTools(mcpServer);
registerDeploymentTools(mcpServer);
registerApprovalTools(mcpServer);
registerConfigurationTools(mcpServer);

// ─── Session store (Streamable HTTP with per-session transports) ──────────────

/**
 * Each MCP client session gets its own StreamableHTTPServerTransport.
 * The transport is stored here so subsequent GET/DELETE requests can reuse it.
 */
const transports = new Map<string, StreamableHTTPServerTransport>();

// ─── Express HTTP server ──────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ─── Optional API key guard ───────────────────────────────────────────────────

/**
 * Protects MCP endpoints with a static API key.
 *
 * Set MCP_API_KEY in the environment to enable. When not set, all requests are
 * allowed through (convenient for local development). When set, clients must
 * include the header:  x-api-key: <value>
 */
const MCP_API_KEY = process.env.MCP_API_KEY ?? '';

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!MCP_API_KEY) {
    next();
    return;
  }
  const provided = req.headers['x-api-key'];
  if (!provided || provided !== MCP_API_KEY) {
    res.status(401).json({ error: 'Unauthorized: provide a valid x-api-key header.' });
    return;
  }
  next();
}

app.use('/mcp', requireApiKey);

/** Health check — useful for Azure App Service / container probes. */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'power-platform-pipeline-mcp', version: '1.0.0' });
});

/**
 * MCP POST — client sends JSON-RPC requests (and initialise).
 *
 * If an mcp-session-id header is present and a transport already exists for it,
 * the existing session is reused. Otherwise a new session is created.
 */
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else {
      // New session: create transport and connect server to it
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport);
          console.log(`[mcp] Session initialised: ${id}`);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
          console.log(`[mcp] Session closed: ${transport.sessionId}`);
        }
      };

      await mcpServer.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] POST error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * MCP GET — client opens an SSE stream to receive server-initiated messages.
 * Requires a valid mcp-session-id header from a prior POST /mcp initialise.
 */
app.get('/mcp', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Valid mcp-session-id header required. Call POST /mcp first.' });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error('[mcp] GET error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * MCP DELETE — client explicitly terminates a session.
 */
app.delete('/mcp', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    transports.delete(sessionId);
  } catch (err) {
    console.error('[mcp] DELETE error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Start listening ──────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`[startup] Power Platform Pipeline MCP server listening on port ${PORT}`);
  console.log(`[startup] MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`[startup] Health check:  http://localhost:${PORT}/health`);
  console.log(`[startup] Dataverse URL: ${process.env.DATAVERSE_URL}`);
});
