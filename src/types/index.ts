// ─── Dataverse entity shapes ─────────────────────────────────────────────────

export interface Pipeline {
  deploymentpipelineid: string;
  name: string;
  description?: string;
  /** 0 = Active, 1 = Inactive */
  statecode: number;
  statuscode: number;
}

export interface PipelineStage {
  deploymentstagedefinitionid: string;
  name: string;
  /** Execution order within the pipeline (1-based) */
  rank: number;
  _deploymentpipelineid_value: string;
  /** Target environment ID / URL for this stage */
  targetenvironmentname?: string;
}

export interface DeploymentStageRun {
  deploymentstagerunid: string;
  name?: string;
  /**
   * Status codes from Dataverse `deploymentstagerun` table:
   *  1  = Deploying
   *  2  = Succeeded
   *  3  = Failed
   *  4  = Awaiting Approval
   *  5  = Canceled
   */
  statuscode: number;
  statecode: number;
  createdon: string;
  modifiedon: string;
  _deploymentstagedefinitionid_value: string;
  _solutionid_value?: string;
  errormessage?: string;
  solutionname?: string;
}

export interface EnvironmentVariableDefinition {
  environmentvariabledefinitionid: string;
  schemaname: string;
  displayname: string;
  /** 100000000 = String, 100000001 = Number, 100000002 = Boolean, 100000003 = JSON, 100000004 = Data source */
  type: number;
  defaultvalue?: string;
  description?: string;
}

export interface EnvironmentVariableValue {
  environmentvariablevalueid: string;
  _environmentvariabledefinitionid_value: string;
  value: string;
}

export interface ConnectionReference {
  connectionreferenceid: string;
  connectionreferencedisplayname: string;
  connectorid: string;
  connectionid?: string;
  /** 0 = Active, 1 = Inactive */
  statecode: number;
}

// ─── Composite / result types ─────────────────────────────────────────────────

export interface EnvironmentVariableWithValue {
  definition: EnvironmentVariableDefinition;
  value?: EnvironmentVariableValue;
}

export interface ODataListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}
