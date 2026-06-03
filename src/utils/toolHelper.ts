import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Thin wrapper around `server.tool()` that prevents TS2589
 * ("Type instantiation is excessively deep") when registering multiple tools
 * on the same McpServer instance. TypeScript accumulates generic state across
 * every `.tool()` call on a single server reference; casting through `any`
 * at this boundary resets that accumulation without sacrificing runtime safety.
 *
 * Handler args are typed via `z.infer<z.ZodObject<T>>` so callers retain
 * full schema-driven type safety.
 */
export function addTool<T extends Record<string, z.ZodTypeAny>>(
  server: McpServer,
  name: string,
  description: string,
  schema: T,
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<ToolResult>
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as (...a: any[]) => void)(name, description, schema, handler);
}
