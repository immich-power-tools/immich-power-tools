import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ApiKey {
  id: string;
  purpose: string;
  keyName: string;
  createdAt: string;
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    const res = await fetch("/api/settings/api-keys");
    if (res.ok) {
      const data = await res.json();
      setKeys(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleDelete = async (purpose: string) => {
    setDeleting(purpose);
    const res = await fetch(`/api/settings/api-keys/${purpose}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.purpose !== purpose));
      toast.success("API key deleted");
    } else {
      const data = await res.json();
      toast.error(data.message ?? "Failed to delete API key");
    }
    setDeleting(null);
  };

  const handleRegenerate = async (purpose: string) => {
    setRegenerating(purpose);
    const res = await fetch(`/api/settings/api-keys/${purpose}`, { method: "PUT" });
    if (res.ok) {
      await fetchKeys();
      toast.success("API key regenerated");
    } else {
      const data = await res.json();
      toast.error(data.message ?? "Failed to regenerate API key");
    }
    setRegenerating(null);
  };

  return (
    <PageLayout>
      <Header leftComponent="Settings" />
      <div className="p-6 flex flex-col gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Managed API keys created by Power Tools in your Immich instance.
              These are used internally for features that require unauthenticated access (e.g. share links).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            {!loading && keys.length === 0 && (
              <p className="text-sm text-muted-foreground">No API keys created yet.</p>
            )}
            {!loading && keys.length > 0 && (
              <ul className="flex flex-col divide-y">
                {keys.map((key) => (
                  <li key={key.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{key.keyName}</span>
                        <Badge variant="secondary" className="capitalize">{key.purpose}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Created {new Date(key.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertDialog
                        title="Regenerate API Key"
                        description={`This will delete the current "${key.keyName}" key from Immich and create a new one. Existing share links will continue to work.`}
                        onConfirm={() => handleRegenerate(key.purpose)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={regenerating === key.purpose || deleting === key.purpose}
                        >
                          <RefreshCw className={`h-4 w-4 ${regenerating === key.purpose ? "animate-spin" : ""}`} />
                        </Button>
                      </AlertDialog>
                      <AlertDialog
                        title="Delete API Key"
                        description={`This will remove the "${key.keyName}" key from Immich and Power Tools. Share links that depend on it will stop serving thumbnails.`}
                        onConfirm={() => handleDelete(key.purpose)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleting === key.purpose || regenerating === key.purpose}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
