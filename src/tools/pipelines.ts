import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { getDataverseClient, extractDataverseError } from '../clients/dataverseClient';
import { ODataListResponse, Pipeline, PipelineStage } from '../types';
import { addTool } from '../utils/toolHelper';

export function registerPipelineTools(server: McpServer): void {
  // --- list_pipelines
  addTool(
    server,
    'list_pipelines',
    `Lists all deployment pipelines configured in the Power Platform environment.
Returns each pipeline's ID, name, description, and active/inactive state.
Use this tool first to discover available pipelines before querying stages or triggering deployments.`,
    {},
    async () => {
      try {
        const client = getDataverseClient();
        const response = await client.get<ODataListResponse<Pipeline>>(
          '/deploymentpipelines?$select=deploymentpipelineid,name,description,statecode,statuscode&$orderby=name asc'
        );
        const pipelines = response.data.value;
        if (pipelines.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No deployment pipelines found in this environment.' }] };
        }
        const lines = [
          `Found ${pipelines.length} pipeline(s):\n`,
          ...pipelines.map((p) => {
            const status = p.statecode === 0 ? 'Active' : 'Inactive';
            const desc = p.description ? `\n    Description: ${p.description}` : '';
            return `\u2022 ${p.name}\n    ID: ${p.deploymentpipelineid}\n    Status: ${status}${desc}`;
          }),
        ];
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error listing pipelines: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- get_pipeline_stages
  addTool(
    server,
    'get_pipeline_stages',
    `Gets the ordered list of deployment stages for a specific pipeline.
Each stage represents a target environment (e.g. Dev to Test to Production) with its own ID.
The stage ID is required when triggering a deployment with deploy_solution.
Use list_pipelines first to obtain the pipeline ID.`,
    {
      pipelineId: z.string().describe('The GUID of the pipeline (deploymentpipelineid) from list_pipelines.'),
    },
    async ({ pipelineId }) => {
      try {
        const client = getDataverseClient();
        const filter = encodeURIComponent(`_deploymentpipelineid_value eq '${pipelineId}'`);
        const response = await client.get<ODataListResponse<PipelineStage>>(
          `/deploymentstagedefinitions?$filter=${filter}&$select=deploymentstagedefinitionid,name,rank,targetenvironmentname&$orderby=rank asc`
        );
        const stages = response.data.value;
        if (stages.length === 0) {
          return { content: [{ type: 'text' as const, text: `No stages found for pipeline ID: ${pipelineId}` }] };
        }
        const lines = [
          `Pipeline ${pipelineId} has ${stages.length} stage(s):\n`,
          ...stages.map((s) => {
            const env = s.targetenvironmentname ? `\n    Target Environment: ${s.targetenvironmentname}` : '';
            return `${s.rank}. ${s.name}\n    Stage ID: ${s.deploymentstagedefinitionid}${env}`;
          }),
        ];
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error fetching pipeline stages: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );
}
