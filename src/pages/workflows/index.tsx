import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog } from "@/components/ui/alert-dialog";
import Loader from "@/components/ui/loader";
import { listWorkflows, createWorkflow, deleteWorkflow, exportWorkflow, importWorkflow } from "@/handlers/api/workflow.handler";
import { IWorkflow, IWorkflowRun } from "@/types/workflow";
import {
  Plus, Download, Upload, Trash2, Workflow,
  Clock, Webhook, GitBranch, Zap, Play,
  CheckCircle, XCircle, AlertCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

interface IWorkflowEnriched extends IWorkflow {
  nodeCount: number;
  triggerCount: number;
  actionCount: number;
  totalRuns: number;
  lastRun: IWorkflowRun | null;
}

function parseCronLabel(cron: string): string {
  if (!cron) return "";
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  if (parts[0].startsWith("*/") && parts[1] === "*") return `Every ${parts[0].slice(2)}m`;
  if (parts[0] === "0" && parts[1].startsWith("*/")) return `Every ${parts[1].slice(2)}h`;
  if (parts[0] === "0" && parts[1] === "0" && parts[2].startsWith("*/")) return `Every ${parts[2].slice(2)}d`;
  return cron;
}

function LastRunStatus({ run }: { run: IWorkflowRun | null }) {
  if (!run) return <span className="text-xs text-muted-foreground">Never run</span>;

  const result = run.result ? (typeof run.result === "string" ? JSON.parse(run.result) : run.result) : {};
  const timeAgo = run.startedAt ? formatDistanceToNow(new Date(run.startedAt), { addSuffix: true }) : "";

  if (run.status === "completed") {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
        <span className="text-xs text-muted-foreground">
          {result.matchedAssets || 0} assets {timeAgo}
        </span>
      </div>
    );
  }
  if (run.status === "failed") {
    return (
      <div className="flex items-center gap-1.5">
        <XCircle className="h-3.5 w-3.5 text-destructive" />
        <span className="text-xs text-destructive">Failed {timeAgo}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <AlertCircle className="h-3.5 w-3.5 text-yellow-500 animate-pulse" />
      <span className="text-xs text-muted-foreground">Running...</span>
    </div>
  );
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<IWorkflowEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const data = await listWorkflows();
      setWorkflows(data as IWorkflowEnriched[]);
    } catch {
      toast.error("Failed to load workflows");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleCreate = async () => {
    try {
      const workflow = await createWorkflow({ name: "Untitled Workflow" });
      router.push(`/workflows/${workflow.id}`);
    } catch {
      toast.error("Failed to create workflow");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkflow(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      toast.success("Workflow deleted");
    } catch {
      toast.error("Failed to delete workflow");
    }
  };

  const handleExport = async (id: string, name: string) => {
    try {
      const data = await exportWorkflow(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^a-zA-Z0-9]/g, "_")}.workflow.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export workflow");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const workflow = await importWorkflow(data);
      setWorkflows((prev) => [workflow as IWorkflowEnriched, ...prev]);
      toast.success(`Workflow "${workflow.name}" imported`);
    } catch {
      toast.error("Failed to import workflow");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <PageLayout>
      <Header
        leftComponent="Workflows"
        rightComponent={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />
              New Workflow
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><Loader /></div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Workflow className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">No workflows yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Automate your library with visual workflows. Create rules to organize, tag, and manage assets automatically.
          </p>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Create Workflow
          </Button>
        </div>
      ) : (
        <div className="p-4 space-y-2">
          {workflows.map((w) => (
            <div
              key={w.id}
              className="group flex items-center gap-4 px-4 py-3 rounded-lg border bg-card hover:bg-accent/50 transition-all cursor-pointer"
              onClick={() => router.push(`/workflows/${w.id}`)}
            >
              {/* Status indicator */}
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                w.enabled ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
              }`}>
                <Zap className="h-4 w-4" />
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{w.name}</span>
                  {w.enabled ? (
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" title="Enabled" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" title="Disabled" />
                  )}
                </div>
                {w.description ? (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{w.description}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/50 mt-0.5">No description</p>
                )}
              </div>

              {/* Triggers */}
              <div className="hidden md:flex items-center gap-1.5 shrink-0">
                {w.cronSchedule && (
                  <Badge variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                    <Clock className="h-2.5 w-2.5" />
                    {parseCronLabel(w.cronSchedule)}
                  </Badge>
                )}
                {w.webhookToken && (
                  <Badge variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                    <Webhook className="h-2.5 w-2.5" />
                    Webhook
                  </Badge>
                )}
              </div>

              {/* Stats */}
              <div className="hidden lg:flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                <div className="flex items-center gap-1" title="Nodes">
                  <GitBranch className="h-3 w-3" />
                  <span>{w.nodeCount || 0}</span>
                </div>
                <div className="flex items-center gap-1" title="Total runs">
                  <Play className="h-3 w-3" />
                  <span>{w.totalRuns || 0}</span>
                </div>
              </div>

              {/* Last run */}
              <div className="hidden sm:block shrink-0 min-w-[140px] text-right">
                <LastRunStatus run={w.lastRun} />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Export" onClick={() => handleExport(w.id, w.name)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog
                  title="Delete workflow?"
                  description={`This will permanently delete "${w.name}" and all its nodes, edges, and run history.`}
                  onConfirm={() => handleDelete(w.id)}
                >
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
