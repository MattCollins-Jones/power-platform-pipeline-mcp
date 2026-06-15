import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDataverseClient, extractDataverseError } from '../clients/dataverseClient.js';
import { ODataListResponse, DeploymentStageRun } from '../types/index.js';
import { addTool } from '../utils/toolHelper.js';

const PENDING_APPROVAL_STATUSCODE = 4;

const APPROVAL_STATUS = {
  APPROVED: 20,
  REJECTED: 30,
} as const;

async function callUpdateApprovalStatus(
  deploymentStageRunId: string,
  approvalStatus: 20 | 30,
  approvalComments?: string
): Promise<void> {
  const client = getDataverseClient();
  await client.post('/UpdateApprovalStatus', {
    DeploymentStageRunId: deploymentStageRunId,
    ApprovalStatus: approvalStatus,
    ...(approvalComments ? { ApprovalComments: approvalComments } : {}),
  });
}

export function registerApprovalTools(server: McpServer): void {
  // --- list_pending_approvals
  addTool(
    server,
    'list_pending_approvals',
    `Lists all deployment stage runs that are currently awaiting approval.
These are deployments that have been triggered but require a human (or automated) approval before they proceed to the next stage.
Returns the run ID, solution name, stage, and timestamps.
Use the run ID with approve_deployment or reject_deployment.`,
    {
      pipelineStageId: z.string().optional().describe('Optional: filter to a specific pipeline stage (deploymentstagedefinitionid).'),
    },
    async ({ pipelineStageId }) => {
      try {
        const client = getDataverseClient();
        let filter = `statuscode eq ${PENDING_APPROVAL_STATUSCODE}`;
        if (pipelineStageId) {
          filter += ` and _deploymentstagedefinitionid_value eq '${pipelineStageId}'`;
        }
        const response = await client.get<ODataListResponse<DeploymentStageRun>>(
          `/deploymentstageruns?$filter=${encodeURIComponent(filter)}&$select=deploymentstagerunid,name,statuscode,createdon,modifiedon,_deploymentstagedefinitionid_value,solutionname&$orderby=createdon desc`
        );
        const runs = response.data.value;
        if (runs.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No deployments are currently awaiting approval.' }] };
        }
        const lines = [
          `${runs.length} deployment(s) awaiting approval:\n`,
          ...runs.map((r) => {
            const solution = r.solutionname ? `\n    Solution: ${r.solutionname}` : '';
            return (
              `\u2022 Run ID: ${r.deploymentstagerunid}` +
              solution +
              `\n    Stage ID: ${r._deploymentstagedefinitionid_value}` +
              `\n    Requested: ${r.createdon}`
            );
          }),
        ];
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error listing pending approvals: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- approve_deployment
  addTool(
    server,
    'approve_deployment',
    `Approves a deployment that is awaiting approval, allowing it to proceed to the next pipeline stage.
This calls the Dataverse UpdateApprovalStatus unbound action as the configured service principal.
IMPORTANT: Microsoft requires the approval to be performed by the service principal that owns the pipeline connection. This server uses the configured SP automatically.
Use list_pending_approvals to find the deploymentStageRunId.`,
    {
      deploymentStageRunId: z.string().describe('GUID of the deployment stage run (deploymentstagerunid) to approve.'),
      approvalComments: z.string().optional().describe('Optional comments to record with the approval decision.'),
    },
    async ({ deploymentStageRunId, approvalComments }) => {
      try {
        await callUpdateApprovalStatus(deploymentStageRunId, APPROVAL_STATUS.APPROVED, approvalComments);
        const commentNote = approvalComments ? `\nComments: "${approvalComments}"` : '';
        return {
          content: [{ type: 'text' as const, text: `Deployment ${deploymentStageRunId} has been approved successfully.${commentNote}\nThe deployment will now proceed to the next stage.` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error approving deployment: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- reject_deployment
  addTool(
    server,
    'reject_deployment',
    `Rejects a deployment that is awaiting approval, preventing it from proceeding.
This calls the Dataverse UpdateApprovalStatus unbound action as the configured service principal.
IMPORTANT: Microsoft requires the rejection to be performed by the service principal that owns the pipeline connection. This server uses the configured SP automatically.
A rejection reason (approvalComments) is strongly recommended for audit purposes.
Use list_pending_approvals to find the deploymentStageRunId.`,
    {
      deploymentStageRunId: z.string().describe('GUID of the deployment stage run (deploymentstagerunid) to reject.'),
      approvalComments: z.string().describe('Reason for rejection - strongly recommended for audit trail.'),
    },
    async ({ deploymentStageRunId, approvalComments }) => {
      try {
        await callUpdateApprovalStatus(deploymentStageRunId, APPROVAL_STATUS.REJECTED, approvalComments);
        return {
          content: [{ type: 'text' as const, text: `Deployment ${deploymentStageRunId} has been rejected.\nReason: "${approvalComments}"` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error rejecting deployment: ${extractDataverseError(error)}` }],
          isError: true,
        };
      }
    }
  );
}
