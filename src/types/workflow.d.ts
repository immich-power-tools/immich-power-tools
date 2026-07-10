export interface IWorkflow {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  cronSchedule: string | null;
  webhookToken: string | null;
  viewport: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkflowNode {
  id: string;
  workflowId: string;
  type: "trigger" | "logic" | "action";
  subType: string;
  data: string;
  positionX: number;
  positionY: number;
  createdAt: Date;
}

export interface IWorkflowEdge {
  id: string;
  workflowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  createdAt: Date;
}

export interface IWorkflowRun {
  id: string;
  workflowId: string;
  trigger: "manual" | "schedule" | "webhook";
  status: "running" | "completed" | "failed";
  result: string;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface IWorkflowWithDetails extends IWorkflow {
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
  lastRun?: IWorkflowRun | null;
}

export type ConditionType =
  | "person" | "person_unnamed"
  | "city" | "state" | "country" | "geo_radius"
  | "date_range" | "date_relative" | "day_of_week"
  | "camera_make" | "camera_model" | "lens"
  | "asset_type" | "iso_range" | "focal_length"
  | "rating" | "is_favorited" | "resolution"
  | "file_size" | "filename" | "file_extension"
  | "face_count" | "time_of_day"
  | "not_in_album" | "not_in_specific_album";

export interface ICondition {
  type: ConditionType;
  [key: string]: any;
}

export interface IManualTriggerData {}
export interface IScheduleTriggerData { cron: string; }
export interface IWebhookTriggerData { token: string; }

export interface IIfNodeData { conditions: ICondition[]; }
export interface ISwitchCase { label: string; conditions: ICondition[]; handle: string; }
export interface ISwitchNodeData { cases: ISwitchCase[]; }

export interface ICreateAlbumActionData { nameTemplate: string; }
export interface IAddToAlbumActionData { albumId: string; }
export interface IRemoveFromAlbumActionData { albumId: string; }
export interface ITagActionData { tagName: string; }

export interface IWorkflowExport {
  version: number;
  name: string;
  description: string | null;
  viewport: string;
  nodes: Omit<IWorkflowNode, "workflowId" | "createdAt">[];
  edges: Omit<IWorkflowEdge, "workflowId" | "createdAt">[];
}
