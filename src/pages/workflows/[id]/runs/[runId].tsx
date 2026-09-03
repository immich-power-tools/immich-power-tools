import "@xyflow/react/dist/style.css";

import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  ReactFlowProvider,
} from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ASSET_THUMBNAIL_PATH } from "@/config/routes";
import { ArrowLeft, CheckCircle, XCircle, Clock, Bug } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import Loader from "@/components/ui/loader";
import API from "@/lib/api";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  FilePlus, FileEdit, Database, GitBranch, GitFork,
  FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag, Tags, Star, UserCheck, Webhook,
} from "lucide-react";

// ---- Annotated Node Components (read-only, with run data) ----

function AnnotatedTriggerNode({ data, selected }: NodeProps) {
  const subType = data.subType as string;
  const step = data.runStep as any;
  const icons: Record<string, any> = { new_asset: FilePlus, asset_updated: FileEdit, all_assets: Database, person_named: UserCheck, album_added: FolderInput, favorited: Heart, rating_changed: Star, tag_added: Tags };
  const labels: Record<string, string> = { new_asset: "New Asset", asset_updated: "Asset Updated", all_assets: "All Assets", person_named: "Person Named", album_added: "Added to Album", favorited: "Favorited", rating_changed: "Rating Changed", tag_added: "Tag Added" };
  const Icon = icons[subType] || FilePlus;

  return (
    <div className={`px-4 py-3 rounded-lg border-2 bg-background min-w-[200px] ${step ? "border-green-500" : "border-muted"}`}>
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-green-500/10">
          <Icon className="h-4 w-4 text-green-500" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium">{labels[subType] || "Trigger"}</p>
          {step && <p className="text-[10px] text-muted-foreground">{step.detail}</p>}
        </div>
        {step && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1">
            {step.outputAssets?.out || 0}
          </Badge>
        )}
      </div>
      {step?.assetIds && step.assetIds.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-2">
          {step.assetIds.slice(0, 8).map((id: string) => (
            <img key={id} src={ASSET_THUMBNAIL_PATH(id)} alt="" className="h-5 w-5 rounded object-cover" />
          ))}
          {step.assetIds.length > 8 && <span className="text-[9px] text-muted-foreground self-center">+{step.assetIds.length - 8}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-3 !h-3" />
    </div>
  );
}

function AnnotatedIfNode({ data }: NodeProps) {
  const step = data.runStep as any;

  return (
    <div className={`px-4 py-3 rounded-lg border-2 bg-background min-w-[200px] ${step ? "border-yellow-500" : "border-muted"}`}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 rounded bg-yellow-500/10">
          <GitBranch className="h-4 w-4 text-yellow-500" />
        </div>
        <p className="text-xs font-medium">IF</p>
        {step && <span className="text-[10px] text-muted-foreground ml-auto">in: {step.inputAssets}</span>}
      </div>
      {step && (
        <div className="flex gap-3 text-[10px] mt-1">
          <span className="text-green-500">true: {step.outputAssets?.true || 0}</span>
          <span className="text-red-500">false: {step.outputAssets?.false || 0}</span>
        </div>
      )}
      {step?.assetIds && step.assetIds.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-2">
          {step.assetIds.slice(0, 6).map((id: string) => (
            <img key={id} src={ASSET_THUMBNAIL_PATH(id)} alt="" className="h-5 w-5 rounded object-cover" />
          ))}
          {step.assetIds.length > 6 && <span className="text-[9px] text-muted-foreground self-center">+{step.assetIds.length - 6}</span>}
        </div>
      )}
      <div className="flex justify-between mt-2 px-2">
        <Handle type="source" position={Position.Bottom} id="true" className="!bg-green-500 !w-2.5 !h-2.5 !relative !transform-none !left-0 !top-0" />
        <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-500 !w-2.5 !h-2.5 !relative !transform-none !left-0 !top-0" />
      </div>
    </div>
  );
}

function AnnotatedSwitchNode({ data }: NodeProps) {
  const step = data.runStep as any;
  const config = data.config ? (typeof data.config === "string" ? JSON.parse(data.config) : data.config) : {};
  const cases = config.cases || [];

  return (
    <div className={`px-4 py-3 rounded-lg border-2 bg-background min-w-[220px] ${step ? "border-orange-500" : "border-muted"}`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 rounded bg-orange-500/10">
          <GitFork className="h-4 w-4 text-orange-500" />
        </div>
        <p className="text-xs font-medium">SWITCH</p>
        {step && <span className="text-[10px] text-muted-foreground ml-auto">in: {step.inputAssets}</span>}
      </div>
      {step && (
        <div className="flex flex-wrap gap-2 text-[10px] mt-1">
          {Object.entries(step.outputAssets || {}).map(([k, v]) => (
            <span key={k} className="text-orange-500">{k}: {v as number}</span>
          ))}
        </div>
      )}
      <div className="flex justify-between mt-2 px-1 gap-2">
        {cases.map((c: any, i: number) => (
          <Handle key={c.handle || `case_${i}`} type="source" position={Position.Bottom} id={c.handle || `case_${i}`} className="!bg-orange-500 !w-2.5 !h-2.5 !relative !transform-none !left-0 !top-0" />
        ))}
        <Handle type="source" position={Position.Bottom} id="default" className="!bg-gray-400 !w-2.5 !h-2.5 !relative !transform-none !left-0 !top-0" />
      </div>
    </div>
  );
}

function AnnotatedActionNode({ data }: NodeProps) {
  const subType = data.subType as string;
  const step = data.runStep as any;
  const icons: Record<string, any> = {
    create_album: FolderPlus, add_to_album: FolderInput, remove_from_album: FolderMinus,
    favorite: Heart, unfavorite: HeartOff, archive: Archive, tag: Tag, remove_tag: Tag, http_request: Webhook,
  };
  const labels: Record<string, string> = {
    create_album: "Create Album", add_to_album: "Add to Album", remove_from_album: "Remove from Album",
    favorite: "Favorite", unfavorite: "Unfavorite", archive: "Archive", tag: "Add Tag", remove_tag: "Remove Tag", http_request: "HTTP Call",
  };
  const Icon = icons[subType] || FolderPlus;
  const isDryRun = step?.detail?.includes("DRY RUN");

  return (
    <div className={`px-4 py-3 rounded-lg border-2 bg-background min-w-[200px] ${step ? (isDryRun ? "border-blue-500" : "border-purple-500") : "border-muted"}`}>
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded ${isDryRun ? "bg-blue-500/10" : "bg-purple-500/10"}`}>
          <Icon className={`h-4 w-4 ${isDryRun ? "text-blue-500" : "text-purple-500"}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium">{labels[subType] || "Action"}</p>
          {step && <p className="text-[10px] text-muted-foreground">{step.detail}</p>}
        </div>
        {step && (
          <Badge variant={isDryRun ? "outline" : "secondary"} className="text-[10px] h-4 px-1">
            {step.inputAssets}
          </Badge>
        )}
      </div>
      {step?.assetIds && step.assetIds.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-2">
          {step.assetIds.slice(0, 8).map((id: string) => (
            <img key={id} src={ASSET_THUMBNAIL_PATH(id)} alt="" className="h-5 w-5 rounded object-cover" />
          ))}
          {step.assetIds.length > 8 && <span className="text-[9px] text-muted-foreground self-center">+{step.assetIds.length - 8}</span>}
        </div>
      )}
    </div>
  );
}

const annotatedNodeTypes = {
  trigger: AnnotatedTriggerNode,
  logic_if: AnnotatedIfNode,
  logic_switch: AnnotatedSwitchNode,
  action: AnnotatedActionNode,
};

// ---- Page Component ----

function dbNodeToFlowNode(n: any, debugSteps: any[]): Node {
  let flowType = "trigger";
  if (n.type === "logic") flowType = n.subType === "switch" ? "logic_switch" : "logic_if";
  else if (n.type === "action") flowType = "action";

  const config = typeof n.data === "string" ? JSON.parse(n.data || "{}") : (n.data || {});
  const runStep = debugSteps.find((s: any) => s.nodeId === n.id) || null;

  return {
    id: n.id,
    type: flowType,
    position: { x: n.positionX, y: n.positionY },
    data: { subType: n.subType, config, label: n.subType, runStep },
    draggable: false,
    connectable: false,
    selectable: false,
  };
}

function dbEdgeToFlowEdge(e: any): Edge {
  return {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    sourceHandle: e.sourceHandle || undefined,
    animated: true,
  };
}

function RunDetailInner() {
  const router = useRouter();
  const { theme } = useTheme();
  const { id, runId } = router.query as { id: string; runId: string };

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selectedNodeAssets, setSelectedNodeAssets] = useState<string[] | null>(null);

  useEffect(() => {
    if (!id || !runId) return;
    setLoading(true);
    API.get(`/api/workflows/${id}/runs/${runId}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, runId]);

  const { nodes, edges, run, result } = useMemo(() => {
    if (!data) return { nodes: [], edges: [], run: null, result: null };

    const runData = data.run;
    const resultParsed = runData.result ? (typeof runData.result === "string" ? JSON.parse(runData.result) : runData.result) : {};
    const debugSteps = resultParsed.debug || resultParsed.actions?.map((a: any) => ({
      nodeId: "",
      nodeType: "action",
      subType: a.action,
      label: `Action: ${a.action}`,
      inputAssets: a.assetsProcessed,
      outputAssets: {},
      assetIds: a.assetIds,
    })) || [];

    const flowNodes = data.workflow.nodes.map((n: any) => dbNodeToFlowNode(n, debugSteps));
    const flowEdges = data.workflow.edges.map((e: any) => dbEdgeToFlowEdge(e));

    return { nodes: flowNodes, edges: flowEdges, run: runData, result: resultParsed };
  }, [data]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><Loader /></div>;
  }

  if (!data || !run) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">Run not found</p>
        <Link href={`/workflows/${id}`}><Button variant="outline" size="sm">Back to Editor</Button></Link>
      </div>
    );
  }

  const statusIcon = run.status === "completed"
    ? <CheckCircle className="h-4 w-4 text-green-500" />
    : run.status === "failed"
      ? <XCircle className="h-4 w-4 text-destructive" />
      : <Clock className="h-4 w-4 text-muted-foreground" />;

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="h-12 border-b flex items-center gap-3 px-4 bg-background shrink-0">
        <Link href={`/workflows/${id}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-medium">Run Detail</span>
        <div className="flex items-center gap-2">
          {statusIcon}
          <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"} className="text-xs">
            {run.status}
          </Badge>
          {run.trigger === "debug" && (
            <Badge variant="outline" className="text-xs">
              <Bug className="h-3 w-3 mr-1" />
              Debug (Dry Run)
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground ml-2">
          {run.startedAt ? format(new Date(run.startedAt), "MMM d, yyyy HH:mm:ss") : ""}
        </span>
        <span className="text-xs font-medium ml-auto">
          {result?.matchedAssets || 0} assets processed
        </span>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph */}
        <div className="flex-1">
          <ReactFlow
            colorMode={theme === "dark" ? "dark" : "light"}
            nodes={nodes}
            edges={edges}
            nodeTypes={annotatedNodeTypes}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll
            onNodeClick={(_, node) => {
              const step = node.data?.runStep as any;
              if (step?.assetIds && step.assetIds.length > 0) {
                setSelectedNodeAssets(step.assetIds);
              } else {
                setSelectedNodeAssets(null);
              }
            }}
            onPaneClick={() => setSelectedNodeAssets(null)}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* Side panel — asset list for selected node */}
        {selectedNodeAssets && (
          <div className="w-72 border-l bg-background overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Assets ({selectedNodeAssets.length})</h3>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedNodeAssets(null)}>
                Close
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {selectedNodeAssets.map((assetId) => (
                <img
                  key={assetId}
                  src={ASSET_THUMBNAIL_PATH(assetId)}
                  alt=""
                  className="w-full aspect-square rounded object-cover"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error bar */}
      {run.error && (
        <div className="border-t bg-destructive/10 px-4 py-2">
          <p className="text-xs text-destructive">{run.error}</p>
        </div>
      )}
    </div>
  );
}

export default function RunDetailPage() {
  return (
    <ReactFlowProvider>
      <RunDetailInner />
    </ReactFlowProvider>
  );
}
