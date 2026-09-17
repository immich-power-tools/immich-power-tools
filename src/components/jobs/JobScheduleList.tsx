import React from "react";
import { IJobSchedule } from "@/types/job";
import { getQueueMeta } from "@/config/constants/jobs.constant";
import { describeCron } from "@/helpers/cron.helper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { AlertCircle, CalendarClock, CheckCircle2, Pencil, Play, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface JobScheduleListProps {
  schedules: IJobSchedule[];
  busyId: string | null;
  onToggle: (schedule: IJobSchedule, enabled: boolean) => void;
  onEdit: (schedule: IJobSchedule) => void;
  onRunNow: (schedule: IJobSchedule) => void;
  onDelete: (schedule: IJobSchedule) => void;
}

const LastRun = ({ schedule }: { schedule: IJobSchedule }) => {
  if (!schedule.lastRunAt) {
    return <span className="text-xs text-muted-foreground">Never run</span>;
  }

  const when = formatDistanceToNow(new Date(schedule.lastRunAt), { addSuffix: true });

  if (schedule.lastStatus === "failed") {
    return (
      <span
        className="text-xs text-destructive inline-flex items-center gap-1"
        title={schedule.lastError ?? undefined}
      >
        <AlertCircle className="h-3 w-3" />
        Failed {when}
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
      <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-500" />
      Ran {when}
    </span>
  );
};

export default function JobScheduleList({
  schedules,
  busyId,
  onToggle,
  onEdit,
  onRunNow,
  onDelete,
}: JobScheduleListProps) {
  if (schedules.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <h3 className="text-sm font-medium mb-1">No schedules yet</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
          Add one to run a job automatically — for example Face Detection on
          missing assets every 6 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border divide-y">
      {schedules.map((schedule) => {
        const meta = getQueueMeta(schedule.queueName);
        const busy = busyId === schedule.id;

        return (
          <div key={schedule.id} className="flex items-center gap-3 p-3">
            <Switch
              checked={schedule.enabled}
              disabled={busy}
              onCheckedChange={(checked) => onToggle(schedule, checked)}
              title={schedule.enabled ? "Disable schedule" : "Enable schedule"}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{meta.label}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {describeCron(schedule.cronSchedule)}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {schedule.force ? "All assets" : "Missing only"}
                </Badge>
                {!schedule.enabled && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Disabled
                  </Badge>
                )}
              </div>
              <div className="mt-1">
                <LastRun schedule={schedule} />
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onRunNow(schedule)}
                title="Run now"
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onEdit(schedule)}
                title="Edit schedule"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <AlertDialog
                title="Delete this schedule?"
                description={`"${meta.label}" will no longer run automatically. Jobs already queued in Immich are unaffected.`}
                onConfirm={async () => onDelete(schedule)}
                disabled={busy}
              >
                <Button size="sm" variant="ghost" disabled={busy} title="Delete schedule">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </AlertDialog>
            </div>
          </div>
        );
      })}
    </div>
  );
}
