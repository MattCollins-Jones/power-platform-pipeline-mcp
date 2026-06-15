import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDataverseClient, extractDataverseError } from '../clients/dataverseClient.js';
import { runPacCommand } from '../clients/pacCliClient.js';
import { ODataListResponse, DeploymentStageRun } from '../types/index.js';
import { addTool } from '../utils/toolHelper.js';

const STATUS_LABEL: Record<number, string> = {
  1: 'Deploying',
  2: 'Succeeded',
  3: 'Failed',
  4: 'Awaiting Approval',
  5: 'Canceled',
};

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isGuid(value: string): boolean {
  return GUID_RE.test(value);
}

function formatRun(run: DeploymentStageRun): string {
  const status = STATUS_LABEL[run.statuscode] ?? `Unknown (${run.statuscode})`;
  const error = run.errormessage ? `\n    Error: ${run.errormessage}` : '';
  const solution = run.solutionname ? `\n    Solution: ${run.solutionname}` : '';
  return (
    `\u2022 Run ID: ${run.deploymentstagerunid}` +
    `\n    Status: ${status}` +
    `\n    Stage ID: ${run._deploymentstagedefinitionid_value}` +
    solution +
    `\n    Started: ${run.createdon}` +
    `\n    Last Updated: ${run.modifiedon}` +
    error
  );
}

export function registerDeploymentTools(server: McpServer): void {
  // --- deploy_solution
  addTool(
    server,
    'deploy_solution',
    `Triggers a Power Platform pipeline deployment for a solution via the PAC CLI.
Requires the PAC CLI to be installed and authenticated on the server as the service principal.
Use get_pipeline_stages to find the correct stageId before calling this tool.
The deployment runs asynchronously; use get_deployment_status to monitor progress.`,
    {
      solutionName: z.string().describe('Unique name of the solution to deploy (not the display name).'),
      stageId: z.string().describe('GUID of the target deployment stage (deploymentstagedefinitionid) from get_pipeline_stages.'),
      currentVersion: z.string().describe('Current version of the solution in the source environment, e.g. "1.0.0.0".'),
      newVersion: z.string().describe('Version to assign after deployment, e.g. "1.0.0.1".'),
      environment: z.string().describe('URL of the source Power Platform environment, e.g. https://yourorg.crm.dynamics.com'),
    },
    async ({ solutionName, stageId, currentVersion, newVersion, environment }) => {
      try {
        const result = await runPacCommand([
          'pipeline', 'deploy',
          '--solutionName', solutionName,
          '--stageId', stageId,
          '--currentVersion', currentVersion,
          '--newVersion', newVersion,
          '--environment', environment,
        ]);
        if (!result.success) {
          return {
            content: [{ type: 'text' as const, text: `Deployment failed to start.\n\nPAC CLI output:\n${result.stdout || result.stderr}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: `Deployment initiated successfully.\n\nPAC CLI output:\n${result.stdout}\n\nUse get_deployment_status or get_deployment_history to monitor progress.` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error triggering deployment: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- get_deployment_status
  addTool(
    server,
    'get_deployment_status',
    `Gets the current status of a specific deployment stage run.
Use this to monitor a running deployment or check why a deployment failed.
Obtain the deploymentStageRunId from deploy_solution output or get_deployment_history.`,
    {
      deploymentStageRunId: z.string().describe('GUID of the deployment stage run (deploymentstagerunid) to check.'),
    },
    async ({ deploymentStageRunId }) => {
      if (!isGuid(deploymentStageRunId)) {
        return {
          content: [{ type: 'text' as const, text: `Invalid deploymentStageRunId: "${deploymentStageRunId}" is not a valid GUID.` }],
          isError: true,
        };
      }
      try {
        const client = getDataverseClient();
        const response = await client.get<DeploymentStageRun>(
          `/deploymentstageruns(${deploymentStageRunId})?$select=deploymentstagerunid,name,statuscode,statecode,createdon,modifiedon,_deploymentstagedefinitionid_value,_solutionid_value,errormessage,solutionname`
        );
        return { content: [{ type: 'text' as const, text: `Deployment Status:\n\n${formatRun(response.data)}` }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error fetching deployment status: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- get_deployment_history
  addTool(
    server,
    'get_deployment_history',
    `Lists the recent deployment history for a pipeline stage, optionally filtered by solution name.
Returns up to 20 most recent runs ordered by creation date descending.
Useful for auditing past deployments, identifying failures, or obtaining run IDs.`,
    {
      stageId: z.string().describe('GUID of the pipeline stage (deploymentstagedefinitionid) to query history for.'),
      solutionName: z.string().optional().describe('Optional: filter results to a specific solution unique name.'),
      top: z.number().int().min(1).max(50).optional().describe('Maximum number of records to return (1-50, default 20).'),
    },
    async ({ stageId, solutionName, top }) => {
      try {
        const client = getDataverseClient();
        const limit = top ?? 20;
        let filter = `_deploymentstagedefinitionid_value eq '${stageId}'`;
        if (solutionName) {
          filter += ` and solutionname eq '${solutionName}'`;
        }
        const response = await client.get<ODataListResponse<DeploymentStageRun>>(
          `/deploymentstageruns?$filter=${encodeURIComponent(filter)}&$select=deploymentstagerunid,name,statuscode,statecode,createdon,modifiedon,_deploymentstagedefinitionid_value,errormessage,solutionname&$orderby=createdon desc&$top=${limit}`
        );
        const runs = response.data.value;
        if (runs.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No deployment history found for the specified stage.' }] };
        }
        const lines = [`Found ${runs.length} deployment run(s):\n`, ...runs.map(formatRun)];
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error fetching deployment history: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );
}
