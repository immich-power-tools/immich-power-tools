import {
  JOB_QUEUES_PATH,
  JOB_RUN_PATH,
  JOB_SCHEDULES_PATH,
  JOB_SCHEDULE_PATH,
} from "@/config/routes";
import API from "@/lib/api";
import { IJobQueue, IJobSchedule, IJobSchedulePayload, JobCommand } from "@/types/job";

export const listJobQueues = async (): Promise<IJobQueue[]> => API.get(JOB_QUEUES_PATH);

export const runJobCommand = async (
  queueName: string,
  command: JobCommand,
  force = false
): Promise<{ success: boolean }> => API.post(JOB_RUN_PATH, { queueName, command, force });

export const listJobSchedules = async (): Promise<IJobSchedule[]> =>
  API.get(JOB_SCHEDULES_PATH);

export const createJobSchedule = async (
  payload: IJobSchedulePayload
): Promise<IJobSchedule> => API.post(JOB_SCHEDULES_PATH, payload);

export const updateJobSchedule = async (
  id: string,
  payload: Partial<IJobSchedulePayload>
): Promise<IJobSchedule> => API.put(JOB_SCHEDULE_PATH(id), payload);

/** Fire a schedule immediately instead of waiting for its next cron tick. */
export const runJobScheduleNow = async (id: string): Promise<IJobSchedule> =>
  API.post(JOB_SCHEDULE_PATH(id), {});

export const deleteJobSchedule = async (id: string): Promise<{ success: boolean }> =>
  API.delete(JOB_SCHEDULE_PATH(id));
