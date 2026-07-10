import "@xyflow/react/dist/style.css";

import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { nodeTypes } from "@/components/workflows/nodes";
import NodePalette from "@/components/workflows/NodePalette";
import { IfConfig, SwitchConfig, ActionConfig } from "@/components/workflows/config";
import { getWorkflow, saveWorkflowGraph, updateWorkflow, runWorkflow, getWorkflowRuns } from "@/handlers/api/workflow.handler";
import { IWorkflowWithDetails } from "@/types/workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import hotToast from "react-hot-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ASSET_THUMBNAIL_PATH } from "@/config/routes";
import { IWorkflowRun } from "@/types/workflow";
import { ArrowLeft, Play, Save, Clock, Webhook, History, ChevronUp, ChevronDown, Bug } from "lucide-react";
import Head from "next/head";
import { format } from "date-fns";
import Link from "next/link";
import Loader from "@/components/ui/loader";
import API from "@/lib/api";
import ApiKeyGate from "@/components/shared/ApiKeyGate";

import { WORKFLOW_PERMISSIONS } from "@/config/permissions";

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Map DB node to React Flow node
function dbNodeToFlowNode(n: any): Node {
  let flowType = "trigger";
  if (n.type === "logic") flowType = n.subType === "switch" ? "logic_switch" : "logic_if";
  else if (n.type === "action") flowType = "action";

  const config = typeof n.data === "string" ? JSON.parse(n.data || "{}") : (n.data || {});

  return {
    id: n.id,
    type: flowType,
    position: { x: n.positionX, y: n.positionY },
    data: { subType: n.subType, config, label: n.subType },
  };
}

// Map DB edge to React Flow edge
function dbEdgeToFlowEdge(e: any): Edge {
  return {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    sourceHandle: e.sourceHandle || undefined,
    animated: true,
  };
}

// Map React Flow node back to DB format
function flowNodeToDb(n: Node) {
  let dbType = "trigger";
  let dbSubType = (n.data?.subType as string) || "manual";
  if (n.type === "logic_if") { dbType = "logic"; dbSubType = "if"; }
  else if (n.type === "logic_switch") { dbType = "logic"; dbSubType = "switch"; }
  else if (n.type === "action") { dbType = "action"; }

  return {
    id: n.id,
    type: dbType,
    subType: dbSubType,
    data: JSON.stringify(n.data?.config || {}),
    positionX: n.position.x,
    positionY: n.position.y,
  };
}

function flowEdgeToDb(e: Edge) {
  return {
    id: e.id,
    sourceNodeId: e.source,
    targetNodeId: e.target,
    sourceHandle: e.sourceHandle || null,
  };
}

const intervalOptions = [
  { label: "Minutes", value: "minutes", cron: (n: number) => `*/${n} * * * *` },
  { label: "Hours", value: "hours", cron: (n: number) => `0 */${n} * * *` },
  { label: "Days", value: "days", cron: (n: number) => `0 0 */${n} * *` },
  { label: "Weeks", value: "weeks", cron: (n: number) => `0 0 * * ${n === 1 ? '0' : `0/${n}`}` },
];

function parseCronToForm(cron: string): { every: number; interval: string } {
  if (!cron) return { every: 0, interval: "hours" };
  const parts = cron.split(" ");
  if (parts.length !== 5) return { every: 0, interval: "hours" };

  // */N * * * * → every N minutes
  if (parts[0].startsWith("*/") && parts[1] === "*") {
    return { every: parseInt(parts[0].slice(2)) || 0, interval: "minutes" };
  }
  // 0 */N * * * → every N hours
  if (parts[0] === "0" && parts[1].startsWith("*/")) {
    return { every: parseInt(parts[1].slice(2)) || 0, interval: "hours" };
  }
  // 0 0 */N * * → every N days
  if (parts[0] === "0" && parts[1] === "0" && parts[2].startsWith("*/")) {
    return { every: parseInt(parts[2].slice(2)) || 0, interval: "days" };
  }
  return { every: 0, interval: "hours" };
}

function TriggerPopover({
  cronSchedule, onCronChange, webhookToken, workflowId,
}: {
  cronSchedule: string; onCronChange: (cron: string) => void; webhookToken: string | null; workflowId?: string;
}) {
  const parsed = parseCronToForm(cronSchedule);
  const [every, setEvery] = useState(parsed.every);
  const [interval, setInterval] = useState(parsed.interval);

  useEffect(() => {
    const p = parseCronToForm(cronSchedule);
    setEvery(p.every);
    setInterval(p.interval);
  }, [cronSchedule]);

  const handleApply = () => {
    if (every <= 0) { handleClear(); return; }
    const opt = intervalOptions.find((o) => o.value === interval);
    if (opt) {
      const cron = opt.cron(every);
      onCronChange(cron);
      if (workflowId) {
        updateWorkflow(workflowId, { cronSchedule: cron } as any)
          .then(() => hotToast.success(`Schedule set — every ${every} ${interval}`))
          .catch(() => hotToast.error("Failed to save schedule"));
      }
    }
  };

  const handleClear = () => {
    setEvery(0);
    setInterval("hours");
    onCronChange("");
    if (workflowId) {
      updateWorkflow(workflowId, { cronSchedule: null } as any)
        .then(() => hotToast.success("Schedule cleared"))
        .catch(() => hotToast.error("Failed to clear schedule"));
    }
  };

  const hasSchedule = !!cronSchedule;
  const hasWebhook = !!webhookToken;
  const isActive = hasSchedule || hasWebhook;

  const webhookUrl = webhookToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/${webhookToken}`
    : "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={isActive ? "secondary" : "ghost"} size="sm" className="h-8">
          <Clock className="h-3.5 w-3.5 mr-1" />
          Triggers
          {isActive && (
            <span className="ml-1.5 text-[10px] bg-primary/15 text-primary rounded px-1 tabular-nums">
              {[hasSchedule && "cron", hasWebhook && "webhook"].filter(Boolean).join(" + ")}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          {/* Schedule section */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Schedule</span>
              {hasSchedule && <span className="ml-auto text-[10px] text-muted-foreground font-mono">{cronSchedule}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Every</span>
              <Input
                className="h-7 text-xs w-16"
                type="number"
                min={0}
                value={every || ""}
                onChange={(e) => setEvery(parseInt(e.target.value) || 0)}
                placeholder="—"
              />
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {intervalOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleApply} disabled={every <= 0}>
                Apply
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClear} disabled={!hasSchedule}>
                Clear
              </Button>
            </div>
          </div>

          <div className="border-t" />

          {/* Webhook section */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Webhook</span>
            </div>
            <Input
              className="h-7 text-[11px] font-mono"
              readOnly
              value={webhookUrl || "Save workflow to get a webhook URL"}
            />
            <p className="text-[10px] text-muted-foreground">
              Configure this URL in Immich admin webhook settings to trigger on events.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WorkflowEditorInner() {
  const router = useRouter();
  const { theme } = useTheme();
  const { id } = router.query as { id: string };
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [workflow, setWorkflow] = useState<IWorkflowWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [cronSchedule, setCronSchedule] = useState("");
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [runs, setRuns] = useState<IWorkflowRun[]>([]);
  const [showRuns, setShowRuns] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getWorkflow(id)
      .then((data) => {
        setWorkflow(data);
        setWorkflowName(data.name);
        setEnabled(data.enabled);
        setCronSchedule(data.cronSchedule || "");
        setWebhookToken(data.webhookToken || null);
        setNodes(data.nodes.map(dbNodeToFlowNode));
        setEdges(data.edges.map(dbEdgeToFlowEdge));
      })
      .catch(() => {
        hotToast.error("Failed to load workflow");
      })
      .finally(() => setLoading(false));

    getWorkflowRuns(id).then(setRuns).catch(() => {});
    API.get("/api/settings/kv/workflow_api_key")
      .then((data) => setHasApiKey(!!data?.value))
      .catch(() => setHasApiKey(false));
  }, [id]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
  }, [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const data = event.dataTransfer.getData("application/reactflow");
    if (!data) return;

    const { type, subType } = JSON.parse(data);
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    let flowType = type;
    if (type === "logic_if" || type === "logic_switch") flowType = type;

    const newNode: Node = {
      id: generateId(),
      type: flowType,
      position,
      data: { subType, config: {}, label: subType },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [screenToFlowPosition, setNodes]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const updateNodeConfig = useCallback((config: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, config } }
          : n
      )
    );
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, config } } : null);
  }, [selectedNode, setNodes]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const viewport = JSON.stringify({ x: 0, y: 0, zoom: 1 });
      await saveWorkflowGraph(id, {
        nodes: nodes.map(flowNodeToDb),
        edges: edges.map(flowEdgeToDb),
        viewport,
      });
      await updateWorkflow(id, {
        name: workflowName,
        enabled,
        cronSchedule: cronSchedule || null,
      } as any);
      hotToast.success("Workflow saved");
    } catch {
      hotToast.error("Failed to save workflow");
    }
    setSaving(false);
  };

  const handleRun = async (mode: "manual" | "debug" = "manual") => {
    if (!id) return;
    setRunning(true);
    hotToast(mode === "debug" ? "Starting debug..." : "Running workflow...");
    try {
      await runWorkflow(id, mode);
      hotToast.success(mode === "debug" ? "Debug complete — no actions executed" : "Workflow run complete");
      getWorkflowRuns(id).then(setRuns).catch(() => {});
      setShowRuns(true);
    } catch {
      hotToast.error("Failed to run workflow");
    }
    setRunning(false);
  };

  const renderConfigPanel = () => {
    if (!selectedNode) return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a node to configure it.
      </div>
    );

    const { subType, config } = selectedNode.data as { subType: string; config: any };
    const nodeType = selectedNode.type;

    const typeLabel = nodeType === "trigger" ? "Asset Trigger" : nodeType === "logic_if" ? "If" : nodeType === "logic_switch" ? "Switch" : "Action";

    return (
      <div className="p-4 space-y-4 overflow-y-auto">
        <h3 className="text-sm font-semibold">{typeLabel}: {subType}</h3>
        {nodeType === "trigger" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {subType === "new_asset" && "Selects assets created since the last successful run. On first run, uses workflow creation time."}
              {subType === "asset_updated" && "Selects assets updated since the last successful run. On first run, uses workflow creation time."}
              {subType === "all_assets" && "Selects all assets in your library. Use with caution on large libraries."}
            </p>
            {subType !== "all_assets" && (
              <div className="space-y-1">
                <Label className="text-xs">Lookback Buffer</Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-7 text-xs w-20"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={config?.lookbackMinutes ?? ""}
                    onChange={(e) => updateNodeConfig({ ...config, lookbackMinutes: parseInt(e.target.value) || 0 })}
                  />
                  <span className="text-xs text-muted-foreground">minutes before last run</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Extends the time window backwards to catch assets that may have been missed. Set to 0 or leave empty for exact last run time.
                </p>
              </div>
            )}
            {workflow?.lastRun?.completedAt ? (
              <p className="text-[10px] text-muted-foreground">
                Last run: {new Date(workflow.lastRun.completedAt).toLocaleString()}
              </p>
            ) : workflow?.createdAt ? (
              <p className="text-[10px] text-muted-foreground">
                No previous runs. Will use since: {new Date(workflow.createdAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        )}
        {nodeType === "logic_if" && (
          <IfConfig config={config || {}} onChange={updateNodeConfig} />
        )}
        {nodeType === "logic_switch" && (
          <SwitchConfig config={config || {}} onChange={updateNodeConfig} />
        )}
        {nodeType === "action" && (
          <ActionConfig subType={subType} config={config || {}} onChange={updateNodeConfig} />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Head>
        <title>{workflowName ? `${workflowName} — Workflow` : "Workflow"}</title>
      </Head>
      {/* Top bar */}
      <div className="h-12 border-b flex items-center gap-3 px-4 bg-background shrink-0">
        <Link href="/workflows" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm text-muted-foreground hidden sm:inline">Workflow</span>
        <span className="text-muted-foreground hidden sm:inline">/</span>
        <Input
          className="h-8 w-64 text-sm font-medium"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
        />
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-muted-foreground">Enabled</span>
          <Switch checked={enabled} onCheckedChange={(val) => {
            setEnabled(val);
            if (id) {
              updateWorkflow(id, { enabled: val } as any)
                .then(() => hotToast.success(val ? "Workflow enabled" : "Workflow disabled"))
                .catch(() => hotToast.error("Failed to update workflow"));
            }
          }} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <TriggerPopover
            cronSchedule={cronSchedule}
            onCronChange={setCronSchedule}
            webhookToken={webhookToken}
            workflowId={id}
          />
          <div className="h-5 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={() => handleRun("debug")} disabled={running}>
            <Bug className="h-3.5 w-3.5 mr-1" />
            Debug
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleRun("manual")} disabled={running}>
            <Play className="h-3.5 w-3.5 mr-1" />
            {running ? "Running..." : "Run"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Node palette */}
        <NodePalette />

        {/* API Key gate — shown instead of canvas when key is missing */}
        {hasApiKey === false && (
          <ApiKeyGate
            title="Workflow API Key Required"
            description="Workflows need a dedicated Immich API key to execute actions like creating albums, favoriting assets, and managing tags. Generate one automatically or configure it in Settings."
            permissions={WORKFLOW_PERMISSIONS}
            generateEndpoint="/api/settings/generate-workflow-api-key"
            onGenerated={() => setHasApiKey(true)}
          />
        )}

        {/* Center: Canvas */}
        <div className={`flex-1 ${hasApiKey === false ? "hidden" : ""}`} ref={reactFlowWrapper}>
          <ReactFlow
            colorMode={theme === "dark" ? "dark" : "light"}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* Right: Config panel */}
        {hasApiKey !== false && (
          <div className="w-72 min-w-[288px] border-l bg-background overflow-y-auto h-full">
            {renderConfigPanel()}
          </div>
        )}
      </div>

      {/* Runs panel */}
      <div className={`border-t bg-background transition-all ${showRuns ? "h-64" : "h-9"}`}>
        <button
          onClick={() => setShowRuns((v) => !v)}
          className="flex items-center gap-2 px-4 h-9 w-full text-left hover:bg-muted transition-colors"
        >
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Run History</span>
          {runs.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{runs.length}</Badge>}
          {showRuns ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronUp className="h-3.5 w-3.5 ml-auto" />}
        </button>
        {showRuns && (
          <div className="overflow-y-auto h-[calc(100%-36px)] px-4">
            {runs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No runs yet. Click Run to execute the workflow.</p>
            ) : (
              <div className="space-y-1 pb-2">
                {runs.map((run) => {
                  const result = run.result ? (typeof run.result === "string" ? JSON.parse(run.result) : run.result) : {};
                  const isExpanded = expandedRunId === run.id;
                  return (
                    <div key={run.id} className="border rounded">
                      <button
                        onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                        className="flex items-center gap-2 px-3 py-1.5 w-full text-left hover:bg-muted/50 transition-colors"
                      >
                        <Badge
                          variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}
                          className="text-[10px] h-4 px-1"
                        >
                          {run.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{run.trigger}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {run.startedAt ? format(new Date(run.startedAt), "MMM d, HH:mm:ss") : ""}
                        </span>
                        <span className="text-[10px] font-medium">{result.matchedAssets || 0} assets</span>
                        <Link
                          href={`/workflows/${id}/runs/${run.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-blue-500 hover:underline ml-1"
                        >
                          View
                        </Link>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-2 space-y-2">
                          {run.error && (
                            <p className="text-[10px] text-destructive">{run.error}</p>
                          )}
                          {result.actions && result.actions.length > 0 && (
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground mb-1">Actions:</p>
                              {result.actions.map((a: any, i: number) => (
                                <div key={i} className="text-[10px] text-muted-foreground">
                                  {a.action}: {a.assetsProcessed} assets
                                  {a.albumName && ` → "${a.albumName}"`}
                                  {a.error && <span className="text-destructive"> ({a.error})</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          {result.debug && result.debug.length > 0 && (
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground mb-1">Debug Steps:</p>
                              <div className="space-y-1.5">
                                {result.debug.map((step: any, i: number) => (
                                  <div key={i} className="text-[10px] border rounded p-1.5 bg-muted/30">
                                    <div className="flex items-center gap-1.5">
                                      <Badge variant="outline" className="text-[9px] h-3.5 px-1">{step.nodeType}</Badge>
                                      <span className="font-medium">{step.label}</span>
                                    </div>
                                    {step.detail && <p className="text-muted-foreground mt-0.5">{step.detail}</p>}
                                    <div className="flex gap-2 mt-0.5">
                                      <span className="text-muted-foreground">In: {step.inputAssets}</span>
                                      {Object.entries(step.outputAssets).map(([k, v]) => (
                                        <span key={k} className="text-muted-foreground">{k}: {v as number}</span>
                                      ))}
                                    </div>
                                    {step.assetIds && step.assetIds.length > 0 && (
                                      <div className="flex flex-wrap gap-0.5 mt-1">
                                        {step.assetIds.slice(0, 20).map((aid: string) => (
                                          <img key={aid} src={ASSET_THUMBNAIL_PATH(aid)} alt="" className="h-6 w-6 rounded object-cover" />
                                        ))}
                                        {step.assetIds.length > 20 && <span className="text-muted-foreground self-center ml-1">+{step.assetIds.length - 20}</span>}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {result.assetIds && result.assetIds.length > 0 && (
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground mb-1">Assets ({result.assetIds.length}):</p>
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                {result.assetIds.slice(0, 50).map((assetId: string) => (
                                  <img
                                    key={assetId}
                                    src={ASSET_THUMBNAIL_PATH(assetId)}
                                    alt=""
                                    className="h-8 w-8 rounded object-cover"
                                  />
                                ))}
                                {result.assetIds.length > 50 && (
                                  <span className="text-[10px] text-muted-foreground self-center">+{result.assetIds.length - 50} more</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkflowEditorPage() {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner />
    </ReactFlowProvider>
  );
}
