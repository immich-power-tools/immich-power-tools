import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SCHEDULABLE_QUEUES, getQueueMeta } from "@/config/constants/jobs.constant";
import { buildCron, describeCron, parseCron } from "@/helpers/cron.helper";
import { IJobSchedule, IJobSchedulePayload, IntervalUnit } from "@/types/job";

interface JobScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing schedule to edit; omit to create a new one. */
  schedule?: IJobSchedule | null;
  /** Preselected queue when creating from a queue card. */
  defaultQueueName?: string;
  onSubmit: (payload: IJobSchedulePayload) => Promise<void>;
}

export default function JobScheduleDialog({
  open,
  onOpenChange,
  schedule,
  defaultQueueName,
  onSubmit,
}: JobScheduleDialogProps) {
  const [queueName, setQueueName] = useState(SCHEDULABLE_QUEUES[0]?.name ?? "");
  const [every, setEvery] = useState(6);
  const [unit, setUnit] = useState<IntervalUnit>("hours");
  const [force, setForce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the dialog opens so stale state never leaks in.
  useEffect(() => {
    if (!open) return;

    if (schedule) {
      setQueueName(schedule.queueName);
      setForce(schedule.force);
      const parsed = parseCron(schedule.cronSchedule);
      if (parsed) {
        setEvery(parsed.every);
        setUnit(parsed.unit);
      }
    } else {
      setQueueName(defaultQueueName ?? SCHEDULABLE_QUEUES[0]?.name ?? "");
      setForce(false);
      setEvery(6);
      setUnit("hours");
    }
    setError(null);
  }, [open, schedule, defaultQueueName]);

  const meta = getQueueMeta(queueName);
  const cronSchedule = buildCron(every, unit);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        queueName,
        cronSchedule,
        force: meta.supportsForce ? force : false,
      });
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit schedule" : "New job schedule"}</DialogTitle>
          <DialogDescription>
            Power Tools will queue this job on a recurring interval, the same way
            pressing the button in Immich would.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="queue">Job</Label>
            <Select value={queueName} onValueChange={setQueueName} disabled={!!schedule}>
              <SelectTrigger id="queue">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULABLE_QUEUES.map((q) => (
                  <SelectItem key={q.name} value={q.name}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Run every</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={every}
                onChange={(e) => setEvery(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24"
              />
              <Select value={unit} onValueChange={(v) => setUnit(v as IntervalUnit)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {describeCron(cronSchedule)} · {cronSchedule}
            </p>
          </div>

          {meta.supportsForce && (
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="force" className="cursor-pointer">
                  Reprocess all assets
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {force
                    ? "Every asset is requeued on each run. Heavy — rarely what you want on a schedule."
                    : "Only assets that have never been processed are queued."}
                </p>
              </div>
              <Switch id="force" checked={force} onCheckedChange={setForce} />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !queueName}>
            {saving ? "Saving…" : schedule ? "Save changes" : "Create schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
