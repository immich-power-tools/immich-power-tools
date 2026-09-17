import React from "react";
import { IJobQueue } from "@/types/job";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Loader2, Pause, Play, RefreshCw, Trash2, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface QueueCardProps {
  queue: IJobQueue;
  busy: boolean;
  onRun: (force: boolean) => void;
  onTogglePause: () => void;
  onClearFailed: () => void;
  onSchedule: () => void;
}

const CountPill = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "active" | "failed";
}) => (
  <div className="flex flex-col">
    <span
      className={cn(
        "text-sm font-medium tabular-nums",
        tone === "active" && value > 0 && "text-blue-600 dark:text-blue-400",
        tone === "failed" && value > 0 && "text-destructive"
      )}
    >
      {value.toLocaleString()}
    </span>
    <span className="text-[11px] text-muted-foreground">{label}</span>
  </div>
);

export default function QueueCard({
  queue,
  busy,
  onRun,
  onTogglePause,
  onClearFailed,
  onSchedule,
}: QueueCardProps) {
  const { jobCounts } = queue;
  const pending = jobCounts.active + jobCounts.waiting + jobCounts.delayed;

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate">{queue.label}</h3>
            {queue.isPaused && (
              <Badge variant="outline" className="text-[10px]">
                Paused
              </Badge>
            )}
            {queue.isActive && pending > 0 && (
              <Badge className="text-[10px] bg-blue-600 hover:bg-blue-600">Running</Badge>
            )}
            {jobCounts.failed > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {jobCounts.failed.toLocaleString()} failed
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {queue.description}
          </p>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
      </div>

      <div className="grid grid-cols-5 gap-2 rounded-md bg-muted/40 px-3 py-2">
        <CountPill label="Active" value={jobCounts.active} tone="active" />
        <CountPill label="Waiting" value={jobCounts.waiting} />
        <CountPill label="Delayed" value={jobCounts.delayed} />
        <CountPill label="Failed" value={jobCounts.failed} tone="failed" />
        <CountPill label="Done" value={jobCounts.completed} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {queue.runnable ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => onRun(false)}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {queue.supportsForce ? "Run missing" : "Run"}
            </Button>

            {queue.supportsForce && (
              <AlertDialog
                title={`Reprocess every asset in ${queue.label}?`}
                description="This queues your entire library, not just unprocessed assets. On a large library this can take hours and put sustained load on your server."
                onConfirm={async () => onRun(true)}
                disabled={busy}
              >
                <Button size="sm" variant="outline" disabled={busy}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Run all
                </Button>
              </AlertDialog>
            )}

            <Button size="sm" variant="outline" disabled={busy} onClick={onSchedule}>
              <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
              Schedule
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground italic">
            Managed internally by Immich — status only.
          </span>
        )}

        <div className="flex-1" />

        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onTogglePause}
          title={queue.isPaused ? "Resume queue" : "Pause queue"}
        >
          {queue.isPaused ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
        </Button>

        {jobCounts.failed > 0 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onClearFailed}
            title="Clear failed jobs"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
