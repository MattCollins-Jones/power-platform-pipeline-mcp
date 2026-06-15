import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDataverseClient, extractDataverseError } from '../clients/dataverseClient.js';
import {
  ODataListResponse,
  EnvironmentVariableDefinition,
  EnvironmentVariableValue,
  EnvironmentVariableWithValue,
  ConnectionReference,
} from '../types/index.js';
import { addTool } from '../utils/toolHelper.js';

/** Escapes single quotes for safe interpolation into OData string literals. */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

const ENV_VAR_TYPE_LABEL: Record<number, string> = {
  100000000: 'String',
  100000001: 'Number',
  100000002: 'Boolean',
  100000003: 'JSON',
  100000004: 'Data source',
};

export function registerConfigurationTools(server: McpServer): void {
  // --- list_environment_variables
  addTool(
    server,
    'list_environment_variables',
    `Lists all environment variable definitions for a solution, along with their current values.
Environment variables allow you to parameterise a solution per deployment target (e.g. different API URLs per environment).
Returns each variable's schema name, display name, type, default value, and any overridden value.
Use set_environment_variable to change a value.`,
    {
      solutionUniqueName: z.string().describe('Unique name of the solution whose environment variables should be listed.'),
    },
    async ({ solutionUniqueName }) => {
      try {
        const client = getDataverseClient();
        const defsResponse = await client.get<ODataListResponse<EnvironmentVariableDefinition>>(
          `/environmentvariabledefinitions?$filter=${encodeURIComponent(`solutionid/uniquename eq '${escapeODataString(solutionUniqueName)}'`)}&$select=environmentvariabledefinitionid,schemaname,displayname,type,defaultvalue,description`
        );
        const definitions = defsResponse.data.value;
        if (definitions.length === 0) {
          return { content: [{ type: 'text' as const, text: `No environment variables found for solution "${solutionUniqueName}".` }] };
        }
        const defIds = definitions
          .map((d) => `_environmentvariabledefinitionid_value eq '${d.environmentvariabledefinitionid}'`)
          .join(' or ');
        const valuesResponse = await client.get<ODataListResponse<EnvironmentVariableValue>>(
          `/environmentvariablevalues?$filter=${encodeURIComponent(defIds)}&$select=environmentvariablevalueid,_environmentvariabledefinitionid_value,value`
        );
        const valueMap = new Map(
          valuesResponse.data.value.map((v) => [v._environmentvariabledefinitionid_value, v])
        );
        const merged: EnvironmentVariableWithValue[] = definitions.map((def) => ({
          definition: def,
          value: valueMap.get(def.environmentvariabledefinitionid),
        }));
        const lines = [
          `Environment variables for solution "${solutionUniqueName}" (${merged.length}):\n`,
          ...merged.map(({ definition: d, value: v }) => {
            const typeLabel = ENV_VAR_TYPE_LABEL[d.type] ?? `Unknown (${d.type})`;
            const currentValue = v?.value ?? d.defaultvalue ?? '(not set)';
            const source = v ? 'Current value' : d.defaultvalue ? 'Default' : 'No value';
            const desc = d.description ? `\n    Description: ${d.description}` : '';
            return (
              `\u2022 ${d.displayname} (${d.schemaname})` +
              `\n    Type: ${typeLabel}` +
              `\n    ${source}: ${currentValue}` +
              `\n    Value ID: ${v?.environmentvariablevalueid ?? 'N/A (create new)'}` +
              desc
            );
          }),
        ];
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error listing environment variables: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- set_environment_variable
  addTool(
    server,
    'set_environment_variable',
    `Updates the value of an environment variable in the current environment.
If a value record already exists (environmentVariableValueId provided), it is updated via PATCH.
If no value record exists yet, a new one is created via POST.
Use list_environment_variables first to obtain the definition ID and current value ID.`,
    {
      environmentVariableDefinitionId: z.string().describe('GUID of the environment variable definition (environmentvariabledefinitionid).'),
      newValue: z.string().describe('The new value to set for the environment variable.'),
      environmentVariableValueId: z.string().optional().describe('GUID of the existing value record (environmentvariablevalueid) to update. Omit to create a new value record.'),
    },
    async ({ environmentVariableDefinitionId, newValue, environmentVariableValueId }) => {
      try {
        const client = getDataverseClient();
        if (environmentVariableValueId) {
          await client.patch(`/environmentvariablevalues(${environmentVariableValueId})`, { value: newValue });
          return {
            content: [{ type: 'text' as const, text: `Environment variable value updated successfully.\nValue ID: ${environmentVariableValueId}\nNew value: ${newValue}` }],
          };
        } else {
          const createResponse = await client.post('/environmentvariablevalues', {
            value: newValue,
            'EnvironmentVariableDefinitionId@odata.bind': `/environmentvariabledefinitions(${environmentVariableDefinitionId})`,
          });
          const newId: string =
            (createResponse.headers['odata-entityid'] as string | undefined)?.match(/\(([^)]+)\)/)?.[1] ?? 'created';
          return {
            content: [{ type: 'text' as const, text: `Environment variable value created successfully.\nNew Value ID: ${newId}\nValue: ${newValue}` }],
          };
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error setting environment variable: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- list_connection_references
  addTool(
    server,
    'list_connection_references',
    `Lists all connection references for a solution.
Connection references are placeholders that must be mapped to real connections in each target environment before flows and apps will work correctly.
Returns each reference's ID, display name, connector type, and the currently mapped connection ID (if any).
Use update_connection_reference to map a reference to a connection.`,
    {
      solutionUniqueName: z.string().describe('Unique name of the solution whose connection references should be listed.'),
    },
    async ({ solutionUniqueName }) => {
      try {
        const client = getDataverseClient();
        const response = await client.get<ODataListResponse<ConnectionReference>>(
          `/connectionreferences?$filter=${encodeURIComponent(`solutionid/uniquename eq '${escapeODataString(solutionUniqueName)}'`)}&$select=connectionreferenceid,connectionreferencedisplayname,connectorid,connectionid,statecode`
        );
        const refs = response.data.value;
        if (refs.length === 0) {
          return { content: [{ type: 'text' as const, text: `No connection references found for solution "${solutionUniqueName}".` }] };
        }
        const lines = [
          `Connection references for solution "${solutionUniqueName}" (${refs.length}):\n`,
          ...refs.map((r) => {
            const mapped = r.connectionid ? `Mapped to ${r.connectionid}` : 'Not mapped';
            const state = r.statecode === 0 ? 'Active' : 'Inactive';
            return (
              `\u2022 ${r.connectionreferencedisplayname}` +
              `\n    Reference ID: ${r.connectionreferenceid}` +
              `\n    Connector: ${r.connectorid}` +
              `\n    Connection: ${mapped}` +
              `\n    State: ${state}`
            );
          }),
        ];
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error listing connection references: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- update_connection_reference
  addTool(
    server,
    'update_connection_reference',
    `Maps a connection reference to a specific connection in the current environment.
This is required after deploying a solution to a new environment - flows and apps will not activate until all connection references are mapped.
The connectionId must be the ID of a connection that already exists in the target environment.
Use list_connection_references to obtain the connectionReferenceId.`,
    {
      connectionReferenceId: z.string().describe('GUID of the connection reference (connectionreferenceid) to update.'),
      connectionId: z.string().describe('ID of the connection to map this reference to (must exist in the target environment).'),
    },
    async ({ connectionReferenceId, connectionId }) => {
      try {
        const client = getDataverseClient();
        await client.patch(`/connectionreferences(${connectionReferenceId})`, { connectionid: connectionId });
        return {
          content: [{ type: 'text' as const, text: `Connection reference ${connectionReferenceId} successfully mapped to connection ${connectionId}.` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error updating connection reference: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );
}
