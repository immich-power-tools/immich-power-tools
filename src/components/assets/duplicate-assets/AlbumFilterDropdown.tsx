import * as React from "react"
import { Check, FolderOpen } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface AlbumFilterDropdownProps {
  options: { label: string; value: string }[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
}

export default function AlbumFilterDropdown({
  options,
  selectedIds,
  onSelectionChange,
}: AlbumFilterDropdownProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (value: string) => {
    const next = new Set(selectedIds)
    if (next.has(value)) {
      next.delete(value)
    } else {
      next.add(value)
    }
    onSelectionChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-sm gap-1.5">
          <FolderOpen size={14} />
          {selectedIds.size > 0 ? `Albums (${selectedIds.size})` : "Albums"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search albums..." />
          <CommandList>
            <CommandEmpty>No albums found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => handleSelect(option.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 min-h-4 min-w-4",
                      selectedIds.has(option.value) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
