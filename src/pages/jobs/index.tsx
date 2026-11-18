import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import Loader from "@/components/ui/loader";
import ApiKeyGate from "@/components/shared/ApiKeyGate";
import QueueCard from "@/components/jobs/QueueCard";
import JobScheduleList from "@/components/jobs/JobScheduleList";
import JobScheduleDialog from "@/components/jobs/JobScheduleDialog";
import { Button } from "@/components/ui/button";
import { JOB_PERMISSIONS } from "@/config/permissions";
import {
  createJobSchedule,
  deleteJobSchedule,
  listJobQueues,
  listJobSchedules,
  runJobCommand,
  runJobScheduleNow,
  updateJobSchedule,
} from "@/handlers/api/job.handler";
import API from "@/lib/api";
import { IJobQueue, IJobSchedule, IJobSchedulePayload } from "@/types/job";
import { getQueueMeta } from "@/config/constants/jobs.constant";
import { CalendarClock, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import hotToast from "react-hot-toast";

const POLL_INTERVAL_MS = 5000;

export default function JobsPage() {
  const [queues, setQueues] = useState<IJobQueue[]>([]);
  const [schedules, setSchedules] = useState<IJobSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [busyQueue, setBusyQueue] = useState<string | null>(null);
  const [busySchedule, setBusySchedule] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<IJobSchedule | null>(null);
  const [defaultQueueName, setDefaultQueueName] = useState<string | undefined>();

  // Keep the polling effect from re-subscribing on every state change.
  const hasApiKeyRef = useRef<boolean | null>(null);
  hasApiKeyRef.current = hasApiKey;

  useEffect(() => {
    API.get("/api/settings/kv/job_api_key")
      .then(() => setHasApiKey(true))
      .catch(() => setHasApiKey(false));
  }, []);

  const fetchQueues = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await listJobQueues();
      setQueues(data);
      setErrorMessage(null);
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to load job queues");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      setSchedules(await listJobSchedules());
    } catch {
      // Non-fatal: the queue list is still useful without schedules.
    }
  }, []);

  useEffect(() => {
    if (hasApiKey === false) {
      setLoading(false);
      return;
    }
    if (hasApiKey === null) return;

    fetchQueues(true);
    fetchSchedules();
  }, [hasApiKey, fetchQueues, fetchSchedules]);

  // Live counts while the page is open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (hasApiKeyRef.current !== false && !document.hidden) fetchQueues();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchQueues]);

  const handleRun = async (queue: IJobQueue, force: boolean) => {
    setBusyQueue(queue.name);
    try {
      await runJobCommand(queue.name, "start", force);
      hotToast.success(
        `Queued ${queue.label}${queue.supportsForce ? (force ? " for all assets" : " for missing assets") : ""}`
      );
      await fetchQueues();
    } catch (error: any) {
      hotToast.error(error?.message || "Failed to start job");
    } finally {
      setBusyQueue(null);
    }
  };

  const handleTogglePause = async (queue: IJobQueue) => {
    setBusyQueue(queue.name);
    try {
      await runJobCommand(queue.name, queue.isPaused ? "resume" : "pause");
      hotToast.success(`${queue.label} ${queue.isPaused ? "resumed" : "paused"}`);
      await fetchQueues();
    } catch (error: any) {
      hotToast.error(error?.message || "Failed to update queue");
    } finally {
      setBusyQueue(null);
    }
  };

  const handleClearFailed = async (queue: IJobQueue) => {
    setBusyQueue(queue.name);
    try {
      await runJobCommand(queue.name, "clear-failed");
      hotToast.success(`Cleared failed jobs in ${queue.label}`);
      await fetchQueues();
    } catch (error: any) {
      hotToast.error(error?.message || "Failed to clear failed jobs");
    } finally {
      setBusyQueue(null);
    }
  };

  const openNewSchedule = (queueName?: string) => {
    setEditingSchedule(null);
    setDefaultQueueName(queueName);
    setDialogOpen(true);
  };

  const handleSubmitSchedule = async (payload: IJobSchedulePayload) => {
    if (editingSchedule) {
      await updateJobSchedule(editingSchedule.id, payload);
      hotToast.success("Schedule updated");
    } else {
      await createJobSchedule(payload);
      hotToast.success("Schedule created");
    }
    await fetchSchedules();
  };

  const handleToggleSchedule = async (schedule: IJobSchedule, enabled: boolean) => {
    setBusySchedule(schedule.id);
    try {
      await updateJobSchedule(schedule.id, { enabled } as IJobSchedulePayload);
      await fetchSchedules();
    } catch (error: any) {
      hotToast.error(error?.message || "Failed to update schedule");
    } finally {
      setBusySchedule(null);
    }
  };

  const handleRunScheduleNow = async (schedule: IJobSchedule) => {
    setBusySchedule(schedule.id);
    try {
      const updated = await runJobScheduleNow(schedule.id);
      if (updated.lastStatus === "failed") {
        hotToast.error(updated.lastError || "Job failed to queue");
      } else {
        hotToast.success(`Queued ${getQueueMeta(schedule.queueName).label}`);
      }
      await Promise.all([fetchSchedules(), fetchQueues()]);
    } catch (error: any) {
      hotToast.error(error?.message || "Failed to run schedule");
    } finally {
      setBusySchedule(null);
    }
  };

  const handleDeleteSchedule = async (schedule: IJobSchedule) => {
    setBusySchedule(schedule.id);
    try {
      await deleteJobSchedule(schedule.id);
      hotToast.success("Schedule deleted");
      await fetchSchedules();
    } catch (error: any) {
      hotToast.error(error?.message || "Failed to delete schedule");
    } finally {
      setBusySchedule(null);
    }
  };

  const renderContent = () => {
    if (hasApiKey === false) {
      return (
        <ApiKeyGate
          title="Job API Key Required"
          description="Immich's job endpoints are admin-only, and scheduled runs happen without a browser session — so Power Tools needs its own admin API key stored server-side. Generate one automatically or configure it in Settings."
          permissions={JOB_PERMISSIONS}
          generateEndpoint="/api/settings/generate-job-api-key"
          onGenerated={() => setHasApiKey(true)}
        />
      );
    }

    if (loading || hasApiKey === null) return <Loader />;

    if (errorMessage) {
      return (
        <div className="p-6">
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive mb-1">
              Could not reach Immich&apos;s job API
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{errorMessage}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                Schedules
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recurring runs handled by Power Tools. These only fire while Power
                Tools is running.
              </p>
            </div>
            <Button size="sm" onClick={() => openNewSchedule()}>
              <Plus className="h-4 w-4 mr-1.5" />
              New schedule
            </Button>
          </div>

          <JobScheduleList
            schedules={schedules}
            busyId={busySchedule}
            onToggle={handleToggleSchedule}
            onEdit={(s) => {
              setEditingSchedule(s);
              setDefaultQueueName(undefined);
              setDialogOpen(true);
            }}
            onRunNow={handleRunScheduleNow}
            onDelete={handleDeleteSchedule}
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Job queues</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live status from Immich, refreshed every {POLL_INTERVAL_MS / 1000}s.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {queues.map((queue) => (
              <QueueCard
                key={queue.name}
                queue={queue}
                busy={busyQueue === queue.name}
                onRun={(force) => handleRun(queue, force)}
                onTogglePause={() => handleTogglePause(queue)}
                onClearFailed={() => handleClearFailed(queue)}
                onSchedule={() => openNewSchedule(queue.name)}
              />
            ))}
          </div>
        </section>
      </div>
    );
  };

  return (
    <PageLayout className="!p-0 !mb-0">
      <Header
        leftComponent="Job Runner"
        rightComponent={
          hasApiKey !== false && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchQueues(true)}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
          )
        }
      />
      {renderContent()}

      <JobScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schedule={editingSchedule}
        defaultQueueName={defaultQueueName}
        onSubmit={handleSubmitSchedule}
      />
    </PageLayout>
  );
}
