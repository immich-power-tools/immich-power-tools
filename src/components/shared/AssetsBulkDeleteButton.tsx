import React, { useMemo } from 'react'
import { Button } from '../ui/button';
import { AlertDialog } from '../ui/alert-dialog';
import { deleteAssets } from '@/handlers/api/asset.handler';
import { toast } from "sonner";

interface AssetsBulkDeleteButtonProps {
  selectedIds: string[];
  onDelete: (ids: string[]) => void;
}

export default function AssetsBulkDeleteButton({ selectedIds, onDelete }: AssetsBulkDeleteButtonProps) {

  const ids = useMemo(() => {
    return selectedIds
  }, [selectedIds]);


  const handleDelete = () => {
    return deleteAssets(ids).then(() => {
      onDelete(ids);
      toast.success(`Deleted ${ids.length} asset(s)`);
    })
  }

  return (
    <AlertDialog
      title="Delete the selected assets?"
      description="This action will delete the selected assets and cannot be undone."
      onConfirm={handleDelete}
      disabled={ids.length === 0}
    >
      <Button variant={"destructive"} size={"sm"} disabled={ids.length === 0}>
        Delete
      </Button>
    </AlertDialog>
  )
}
