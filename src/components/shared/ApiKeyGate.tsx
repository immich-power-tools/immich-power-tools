import React, { useState } from "react";
import { KeyRound, Wand2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { toast } from "sonner";

interface Permission {
  name: string;
  description: string;
}

interface ApiKeyGateProps {
  title: string;
  description: string;
  permissions: Permission[];
  generateEndpoint: string;
  onGenerated: () => void;
}

export default function ApiKeyGate({ title, description, permissions, generateEndpoint, onGenerated }: ApiKeyGateProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(generateEndpoint, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to generate API key");
      }
      toast.success("API key generated");
      onGenerated();
    } catch (err: any) {
      setError(err.message ?? "Failed to generate API key");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
          <KeyRound className="h-6 w-6 text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 text-left space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Required permissions</p>
          <div className="flex flex-wrap gap-1.5">
            {permissions.map((p) => (
              <Badge key={p.name} variant="outline" className="text-[11px] font-mono font-normal" title={p.description}>
                {p.name}
              </Badge>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <div className="flex flex-col gap-2">
          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            <Wand2 className="h-4 w-4 mr-2" />
            {generating ? "Generating…" : "Generate API key automatically"}
          </Button>
          <Link href="/settings">
            <Button variant="outline" className="w-full">
              <Settings className="h-4 w-4 mr-2" />
              Configure manually in Settings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
