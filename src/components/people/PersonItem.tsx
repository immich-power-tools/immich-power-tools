import { IPerson } from "@/types/person";
import React, { useRef, useState } from "react";
import { mergePerson, searchPeople, updatePerson } from "@/handlers/api/people.handler";
import { PersonMergeDropdown } from "./PersonMergeDropdown";
import PersonBirthdayCell from "./PersonBirthdayCell";
import clsx from "clsx";
import Link from "next/link";
import { ArrowUpRight, Eye, EyeOff, GitMerge, Info, MoreHorizontal, Share2 } from "lucide-react";
import { useConfig } from "@/contexts/ConfigContext";
import { toast } from "sonner";
import ShareAssetsTrigger from "../shared/ShareAssetsTrigger";
import { Autocomplete, AutocompleteOption } from "../ui/autocomplete";
import { AlertDialog, IAlertDialogActions } from "../ui/alert-dialog";
import { Tooltip } from "../ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface IProps {
  person: IPerson;
  onRemove: (person: IPerson) => void;
}

export default function PersonItem({ person, onRemove }: IProps) {
  const { exImmichUrl } = useConfig();
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(person);
  const selectedPerson = useRef<AutocompleteOption | null>(null);
  const mergeDialogRef = useRef<IAlertDialogActions>(null);

  const handleEdit = () => {
    if (formData.name && formData.name !== person.name) {
      setLoading(true);
      return updatePerson(person.id, { name: formData.name })
        .then(() => {
          setEditMode(false);
          toast.success("Person updated successfully");
        })
        .catch(() => {
          toast.error("Failed to update person");
        })
        .finally(() => setLoading(false));
    } else {
      setEditMode(!editMode);
    }
  };

  const handleHide = (hidden: boolean) => {
    setLoading(true);
    return updatePerson(person.id, { isHidden: hidden })
      .then(() => setFormData((p) => ({ ...p, isHidden: hidden })))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleMerge = async (option: AutocompleteOption) => {
    await mergePerson(person.id, [option.value]);
  };

  return (
    <div
      className={clsx(
        "group relative flex flex-col rounded-xl overflow-hidden border bg-card transition-all duration-200",
        "hover:shadow-lg hover:border-border/80",
        {
          "opacity-40": formData.isHidden,
          "border-border shadow-sm": formData.name,
          "border-border/40": !formData.name,
        }
      )}
    >
      {/* Image area */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {person.thumbnailPath ? (
          <img
            src={person.thumbnailPath}
            alt={formData.name || "Unknown"}
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <span className="text-4xl text-muted-foreground/30 font-light select-none">?</span>
          </div>
        )}

        {/* Gradient overlay — always visible at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

        {/* Asset count — bottom-left of image */}
        <div className="absolute bottom-1.5 left-2 pointer-events-none">
          <span className="text-[10px] font-medium text-white/80 tabular-nums">
            {formData.isHidden && <span className="mr-0.5 opacity-70">Hidden ·</span>}
            {person.assetCount}
          </span>
        </div>

        {/* Three-dot menu — top-right, visible on hover */}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition-colors">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="min-w-[160px]">
              <DropdownMenuItem asChild>
                <Link href={`/people/${person.id}`} className="gap-2">
                  <Info className="h-3.5 w-3.5" />
                  View details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${exImmichUrl}/people/${person.id}`} target="_blank" className="gap-2">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Open in Immich
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <ShareAssetsTrigger
                filters={{ personIds: [person.id] }}
                asDropdownItem
              >
                <Share2 className="h-3.5 w-3.5" />
                Share assets
              </ShareAssetsTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Quick actions — bottom-right, visible on hover */}
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <Tooltip content={formData.isHidden ? "Show person" : "Hide person"}>
            <button
              onClick={() => handleHide(!formData.isHidden)}
              disabled={loading}
              className="h-6 w-6 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm flex items-center justify-center transition-colors"
            >
              {formData.isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
          </Tooltip>
          <Tooltip content="Merge">
            <span>
              <PersonMergeDropdown
                person={person}
                onRemove={onRemove}
                triggerClassName="!p-0 !h-6 !w-6 rounded-full !bg-black/50 hover:!bg-black/70 !text-white !border-transparent backdrop-blur-sm flex items-center justify-center"
                triggerIcon={<GitMerge className="h-3 w-3" />}
              />
            </span>
          </Tooltip>
        </div>
      </div>

      {/* Name + birthday section */}
      <div className="px-1.5 py-1.5 flex flex-col gap-1 min-w-0">
        {!editMode ? (
          <button
            className="text-left w-full text-xs font-semibold leading-snug hover:text-muted-foreground transition-colors truncate"
            onClick={() => setEditMode(true)}
            title={formData.name || "Click to set name"}
          >
            {formData.name || (
              <span className="text-muted-foreground/50 font-normal italic text-[11px]">Unknown</span>
            )}
          </button>
        ) : (
          <Autocomplete
            loadOptions={(query: string) =>
              searchPeople(query).then((people) =>
                people.map((p: any) => ({ label: p.name, value: p.id, imageUrl: p.thumbnailPath }))
              )
            }
            type="text"
            className="text-xs font-semibold w-full px-1 py-0.5 rounded-md"
            defaultValue={formData.name}
            placeholder="Enter name"
            autoFocus
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            value={formData.name}
            onOptionSelect={(value) => {
              mergeDialogRef.current?.open();
              selectedPerson.current = value;
            }}
            createNewLabel="Save"
            disabled={loading}
            onCreateNew={() => handleEdit()}
          />
        )}

        <PersonBirthdayCell person={person} />
      </div>

      <AlertDialog
        ref={mergeDialogRef}
        title="Merge Person"
        description="Are you sure you want to merge this person with the selected person?"
        onConfirm={() => {
          if (selectedPerson.current) handleMerge(selectedPerson.current);
        }}
      />
    </div>
  );
}
