import React from 'react'
import Mentions from 'rc-mentions'
import { useTheme } from 'next-themes'
import { AnimatePresence, motion } from 'framer-motion'
import { listPeople, searchPeople } from '@/handlers/api/people.handler'
import { ArrowUp, Loader2, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import BorderGlow from '@/components/ui/border-glow'
import { LOGO_COLORS } from '@/config/constants/brand'

interface FindInputProps {
  onSearch: (query: string, displayQuery: string) => void;
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  autoFocus?: boolean;
  dropdownPlacement?: 'top' | 'bottom';
  // cycled through while the input is empty, to hint at what can be asked
  placeholders?: string[];
}

const DEFAULT_PLACEHOLDERS = ['Ask for photos, use @ to mention people']

const iconSwap = {
  initial: { opacity: 0, scale: 0.5, rotate: -90 },
  animate: { opacity: 1, scale: 1, rotate: 0 },
  exit: { opacity: 0, scale: 0.5, rotate: 90 },
  transition: { type: 'spring' as const, stiffness: 500, damping: 30 },
}

export default function FindInput({ onSearch, value, onChange, loading, autoFocus, dropdownPlacement, placeholders = DEFAULT_PLACEHOLDERS }: FindInputProps) {
  const [options, setOptions] = React.useState<{ value: string; label: string }[]>([])
  const [focused, setFocused] = React.useState(false)
  const [placeholderIndex, setPlaceholderIndex] = React.useState(0)
  const nameToIdRef = React.useRef<Record<string, string>>({})
  const mentionsRef = React.useRef<React.ComponentRef<typeof Mentions>>(null)
  const wasLoadingRef = React.useRef(false)
  const { resolvedTheme } = useTheme()

  // A disabled textarea drops focus; hand it back once the search resolves
  React.useEffect(() => {
    if (wasLoadingRef.current && !loading) mentionsRef.current?.focus()
    wasLoadingRef.current = !!loading
  }, [loading])

  React.useEffect(() => {
    if (value || placeholders.length < 2) return
    const id = window.setInterval(() => setPlaceholderIndex((index) => index + 1), 3200)
    return () => window.clearInterval(id)
  }, [value, placeholders.length])

  const isDark = resolvedTheme !== 'light'
  const canSubmit = !!value.trim() && !loading

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
    if (canSubmit) {
      onSearch(buildQueryWithIds(value), value)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <BorderGlow
      className="w-full"
      contentClassName="overflow-visible"
      borderRadius={18}
      glowRadius={36}
      edgeSensitivity={22}
      glowColor={isDark ? '213 92 68' : '213 90 58'}
      colors={[LOGO_COLORS[0], LOGO_COLORS[1], LOGO_COLORS[3]]}
      backgroundColor={isDark ? '#0a0a0a' : '#ffffff'}
      active={focused || !!loading}
    >
      <motion.div
        className={cn('flex items-center gap-2 px-3 py-1.5', loading && 'cursor-not-allowed')}
        animate={{ opacity: loading ? 0.6 : 1 }}
        transition={{ duration: 0.25 }}
        aria-busy={loading}
      >
        <motion.div
          animate={focused ? { rotate: [0, -12, 12, 0], scale: [1, 1.15, 1] } : { rotate: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Sparkles
            className={cn(
              'h-5 w-5 shrink-0 transition-colors duration-300',
              focused ? 'text-blue-500' : 'text-muted-foreground'
            )}
          />
        </motion.div>
        <Mentions
          ref={mentionsRef}
          value={value}
          prefix="@"
          placeholder={loading ? 'Searching your library…' : placeholders[placeholderIndex % placeholders.length]}
          disabled={loading}
          onSearch={handleMentionSearch}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          options={options}
          autoFocus={autoFocus}
          placement={dropdownPlacement}
          rows={1}
        />
        <AnimatePresence>
          {value && !loading && (
            <motion.button
              key="clear"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              whileTap={{ scale: 0.85 }}
              onClick={handleClear}
              className="shrink-0 rounded-full p-1 hover:bg-muted transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button
          onClick={handleSubmit}
          disabled={!canSubmit}
          animate={{
            scale: canSubmit ? 1 : 0.9,
            opacity: canSubmit ? 1 : 0.45,
          }}
          whileHover={canSubmit ? { scale: 1.08 } : undefined}
          whileTap={canSubmit ? { scale: 0.9 } : undefined}
          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          className={cn(
            'relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full',
            'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
            'disabled:pointer-events-none'
          )}
          aria-label="Search"
        >
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.span key="spinner" {...iconSwap} className="flex">
                <Loader2 className="h-4 w-4 animate-spin" />
              </motion.span>
            ) : (
              <motion.span key="arrow" {...iconSwap} className="flex">
                <ArrowUp className="h-4 w-4" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>
    </BorderGlow>
  )
}
