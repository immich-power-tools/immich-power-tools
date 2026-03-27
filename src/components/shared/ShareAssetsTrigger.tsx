import React, { useState } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogHeader, DialogTrigger, DialogDescription } from '../ui/dialog';
import { Button, ButtonProps } from '../ui/button';
import { ShareLinkFilters } from '@/types/shareLink';
import { generateShareLink } from '@/handlers/api/shareLink.handler';
import { Input } from '../ui/input';
import { Label } from '@radix-ui/react-label';

import { Switch } from '../ui/switch';
import { Select, SelectValue, SelectContent, SelectItem, SelectTrigger } from '../ui/select';

interface ShareAssetsTriggerProps {
  filters: ShareLinkFilters
  buttonProps?: ButtonProps
}

export default function ShareAssetsTrigger({ filters, buttonProps }: ShareAssetsTriggerProps) {
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<Partial<ShareLinkFilters>>({
    expiresIn: "never"
  });
  const [endpointConfigured, setEndpointConfigured] = useState<boolean | null>(null);
  const [shareKeyExists, setShareKeyExists] = useState<boolean | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const checkShareKey = async () => {
    const res = await fetch('/api/share-key');
    const data = await res.json();
    setEndpointConfigured(data.endpointConfigured);
    setShareKeyExists(data.exists);
  };

  const handleCreateKey = async () => {
    setCreatingKey(true);
    setKeyError(null);
    const res = await fetch('/api/share-key', { method: 'POST' });
    if (res.ok) {
      setShareKeyExists(true);
    } else {
      const data = await res.json();
      setKeyError(data.message ?? 'Failed to create share key');
    }
    setCreatingKey(false);
  };

  const handleReset = () => {
    setConfig({ expiresIn: "never" });
    setGeneratedLink(null);
  }

  const handleGenerate = async () => {
    setLoading(true);
    setErrorMessage(null);
    return generateShareLink({ ...filters, ...config }).then(({ link }) => {
      setGeneratedLink(link);
    }).catch((err) => {
      setErrorMessage(err.message);
    }).finally(() => {
      setLoading(false);
    });
  }

  const handleCopy = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  }


  return (
    <Dialog onOpenChange={(open) => { if (open) checkShareKey(); }}>
      <DialogTrigger asChild>
        <Button {...buttonProps}>Share</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Assets</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Generate a share link for the selected assets (either bunch of albums or bunch of people) and share it with your friends and family.
        </DialogDescription>
        {endpointConfigured === false && (
          <div className="rounded-md border border-red-400 bg-red-50 dark:bg-red-950 p-3">
            <p className="text-sm text-red-800 dark:text-red-200">
              <strong>POWER_TOOLS_ENDPOINT_URL</strong> is not set. Add it to your environment variables to enable share links.
            </p>
          </div>
        )}
        {endpointConfigured && shareKeyExists === false && (
          <div className="rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950 p-3 flex flex-col gap-2">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Serving thumbnails on share links requires a dedicated API key. Create one now with minimal permissions.
            </p>
            {keyError && <p className="text-xs text-red-500">{keyError}</p>}
            <Button size="sm" onClick={handleCreateKey} disabled={creatingKey} className="self-start">
              {creatingKey ? 'Creating...' : 'Create API Key'}
            </Button>
          </div>
        )}
        {errorMessage && <div className="text-red-500">{errorMessage}</div>}
        {generatedLink ? <div className="flex flex-col gap-2">
          <Label className='text-sm'>Share Link</Label>
          <Input readOnly type="text" value={generatedLink} />
          <p className='text-xs text-muted-foreground'>
            This is a stateless link, it will not work if you leave the page. Which means it cannot be expired.
          </p>
          <div className="flex gap-2">
            <Button className="w-full" onClick={handleCopy}>{copied ? 'Copied' : 'Copy'}</Button>
            <Button className="w-full" variant="outline" onClick={handleReset}>Generate New Link</Button>
          </div>
        </div> : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-1">
              <div className="flex flex-col gap-1">
                <Label className="text-sm m-0">Show People</Label>
                <p className="text-xs text-muted-foreground m-0">
                  Show the list of people in the shared photos
                </p>
              </div>
              <Switch checked={config.p} onCheckedChange={(checked) => setConfig({ ...config, p: !!checked })} />
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex flex-col gap-1">
                <Label className="text-sm m-0">Link Expires In</Label>
                <p className="text-xs text-muted-foreground m-0">
                  Should the link expire after the selected time
                </p>
              </div>
              <Select onValueChange={(value) => setConfig({ ...config, expiresIn: value })}>
                <SelectTrigger className='w-fit'>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="1d">1 Day (24 Hours)</SelectItem>
                  <SelectItem value="7d">7 Days</SelectItem>
                  <SelectItem value="30d">30 Days</SelectItem>
                  <SelectItem value="90d">90 Days</SelectItem>
                  <SelectItem value="never">Never Expires</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerate} disabled={loading || !endpointConfigured || !shareKeyExists}>Generate Share Link</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
