export type JobCommand = "start" | "pause" | "resume" | "empty" | "clear-failed";

/** Immich's per-queue counts from `GET /api/jobs`. */
export interface IJobCounts {
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  waiting: number;
  paused: number;
}

export interface IJobQueueStatus {
  jobCounts: IJobCounts;
  queueStatus: {
    isActive: boolean;
    isPaused: boolean;
  };
}

/** A queue plus its metadata, as served to the UI. */
export interface IJobQueue {
  name: string;
  label: string;
  description: string;
  runnable: boolean;
  supportsForce: boolean;
  jobCounts: IJobCounts;
  isActive: boolean;
  isPaused: boolean;
}

export interface IJobSchedule {
  id: string;
  ownerId: string;
  queueName: string;
  force: boolean;
  cronSchedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: "success" | "failed" | null;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface IJobSchedulePayload {
  queueName: string;
  force?: boolean;
  cronSchedule: string;
  enabled?: boolean;
}

/** Interval units offered in the schedule builder. */
export type IntervalUnit = "minutes" | "hours" | "days";
