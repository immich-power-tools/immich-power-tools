import React from 'react'
import Mentions from 'rc-mentions'
import { listPeople, searchPeople } from '@/handlers/api/people.handler'
import { ArrowRight, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FindInputProps {
  onSearch: (query: string) => void;
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
}

export default function FindInput({ onSearch, value, onChange, loading }: FindInputProps) {
  const [options, setOptions] = React.useState<{ value: string; label: string }[]>([])
  const [focused, setFocused] = React.useState(false)
  const nameToIdRef = React.useRef<Record<string, string>>({})

  const handleMentionSearch = async (text: string, prefix: string) => {
    if (prefix !== '@') {
      setOptions([])
      return
    }
    const people = text.length
      ? await searchPeople(text)
      : await listPeople({ page: 1, perPage: 50, sort: 'assetCount', sortOrder: 'desc' }).then((r) => r.people)
    people.forEach((person: any) => {
      if (person.name) nameToIdRef.current[person.name] = person.id
    })
    setOptions(
      people
        .filter((person: any) => person.name)
        .map((person: any) => ({
          value: person.name,
          label: person.name,
        }))
    )
  }

  const handleClear = () => {
    onChange('')
  }

  const buildQueryWithIds = (displayValue: string) => {
    let query = displayValue
    for (const [name, id] of Object.entries(nameToIdRef.current)) {
      query = query.replaceAll(`@${name}`, `@${id}`)
    }
    return query
  }

  const handleSubmit = () => {
    if (value.trim()) {
      onSearch(buildQueryWithIds(value))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className={cn(
      "flex items-center gap-2 rounded-xl border bg-background px-3 transition-shadow w-full",
      focused ? "ring-2 ring-ring shadow-sm" : "border-input"
    )}>
      <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
      <Mentions
        value={value}
        prefix="@"
        placeholder="Search for photos, use @ to mention people"
        onSearch={handleMentionSearch}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        options={options}
        rows={1}
      />
      {value && !loading && (
        <button
          onClick={handleClear}
          className="shrink-0 rounded-full p-1 hover:bg-muted transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || loading}
        className="shrink-0 rounded-lg p-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        aria-label="Search"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowRight className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
