import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import {
  Album,
  Aperture,
  Archive,
  ArrowDownUp,
  Baby,
  Calendar,
  CalendarHeart,
  Camera,
  FileText,
  Hash,
  HardDrive,
  Heart,
  Image as ImageIcon,
  ListOrdered,
  LucideIcon,
  MapPin,
  ScanText,
  Shuffle,
  Sparkles,
  Star,
  Tag,
  Video,
  X,
  Zap,
  FolderMinus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PERSON_THUBNAIL_PATH } from '@/config/routes'
import { IFindFilters, IFindTurn } from '@/types/find'

interface IChip {
  key: string;
  label: string;
  value?: string;
  icon?: LucideIcon;
  personId?: string;
  // filters once this chip is taken away
  without: IFindFilters;
}

const omit = (filters: IFindFilters, ...keys: (keyof IFindFilters)[]) => {
  const next = { ...filters };
  keys.forEach((key) => delete next[key]);
  return next;
}

const formatDate = (value: string) => format(new Date(value.slice(0, 10) + 'T00:00:00'), 'MMM d, yyyy');

const formatDateRange = ({ takenAfter, takenBefore }: IFindFilters) => {
  if (takenAfter && takenBefore) return `${formatDate(takenAfter)} to ${formatDate(takenBefore)}`;
  if (takenAfter) return `After ${formatDate(takenAfter)}`;
  return `Before ${formatDate(takenBefore as string)}`;
}

const formatAge = ({ ageMin, ageMax }: IFindFilters) => {
  if (ageMin !== undefined && ageMax !== undefined && ageMin !== ageMax) return `${ageMin} to ${ageMax}`;
  return String(ageMin ?? ageMax);
}

const TYPE_LABELS: Record<string, string> = { IMAGE: 'Photos', VIDEO: 'Videos', AUDIO: 'Audio' };
const INTENT_CHIPS: Record<string, { label: string; icon: LucideIcon }> = {
  random: { label: 'Shuffled', icon: Shuffle },
  count: { label: 'Count', icon: Hash },
  largest: { label: 'Largest files', icon: HardDrive },
};

const buildChips = (filters: IFindFilters, labels: Record<string, string>): IChip[] => {
  const chips: IChip[] = [];
  const idChips = (key: 'personIds' | 'albumIds' | 'tagIds', label: string, icon?: LucideIcon) => {
    (filters[key] || []).forEach((id) => {
      const rest = (filters[key] || []).filter((other) => other !== id);
      chips.push({
        key: `${key}-${id}`,
        label,
        value: labels[id] || 'Unknown',
        icon,
        personId: key === 'personIds' ? id : undefined,
        without: rest.length ? { ...filters, [key]: rest } : omit(filters, key),
      });
    });
  };
  const textChip = (key: keyof IFindFilters, label: string, icon: LucideIcon, value?: string) => {
    if (filters[key] === undefined) return;
    chips.push({ key, label, icon, value: value ?? String(filters[key]), without: omit(filters, key) });
  };
  const flagChip = (key: keyof IFindFilters, label: string, icon: LucideIcon) => {
    if (filters[key]) chips.push({ key, label, icon, without: omit(filters, key) });
  };

  if (filters.intent && INTENT_CHIPS[filters.intent]) {
    chips.push({ key: 'intent', ...INTENT_CHIPS[filters.intent], without: omit(filters, 'intent') });
  }
  idChips('personIds', 'Person');
  if (filters.ageMin !== undefined || filters.ageMax !== undefined) {
    chips.push({ key: 'age', label: 'Age', icon: Baby, value: formatAge(filters), without: omit(filters, 'ageMin', 'ageMax') });
  }
  textChip('query', 'Looks like', Sparkles);
  flagChip('onThisDay', 'On this day', CalendarHeart);
  if (filters.takenAfter || filters.takenBefore) {
    chips.push({ key: 'date', label: 'Date', icon: Calendar, value: formatDateRange(filters), without: omit(filters, 'takenAfter', 'takenBefore') });
  }
  textChip('city', 'City', MapPin);
  textChip('state', 'State', MapPin);
  textChip('country', 'Country', MapPin);
  idChips('albumIds', 'Album', Album);
  idChips('tagIds', 'Tag', Tag);
  if (filters.type) {
    chips.push({ key: 'type', label: TYPE_LABELS[filters.type] || filters.type, icon: filters.type === 'VIDEO' ? Video : ImageIcon, without: omit(filters, 'type') });
  }
  flagChip('isFavorite', 'Favorites', Heart);
  flagChip('isArchived', 'Archived', Archive);
  flagChip('isMotion', 'Motion photos', Zap);
  flagChip('isNotInAlbum', 'Not in any album', FolderMinus);
  textChip('rating', 'Rating', Star, `${filters.rating}★`);
  textChip('make', 'Make', Camera);
  textChip('model', 'Camera', Camera);
  textChip('lensModel', 'Lens', Aperture);
  textChip('ocr', 'Text in photo', ScanText);
  textChip('description', 'Description', FileText);
  textChip('fileName', 'File name', FileText);
  textChip('order', filters.order === 'asc' ? 'Oldest first' : 'Newest first', ArrowDownUp, '');
  textChip('limit', 'Limit', ListOrdered);
  return chips;
}

const PersonFace = ({ id, className }: { id: string; className?: string }) => (
  <img
    src={PERSON_THUBNAIL_PATH(id)}
    alt=""
    className={cn('rounded-full object-cover ring-1 ring-blue-500/30', className)}
  />
);

interface FindFiltersProps {
  turn: IFindTurn;
  disabled?: boolean;
  onChange: (filters: IFindFilters) => void;
}

export default function FindFilters({ turn, disabled, onChange }: FindFiltersProps) {
  const { filters, labels, alternatives } = turn;
  const chips = buildChips(filters, labels);

  // One-tap tweaks that never need the AI model
  const refinements = [
    filters.type !== 'IMAGE' && { label: 'Only photos', icon: ImageIcon, next: { ...filters, type: 'IMAGE' } },
    filters.type !== 'VIDEO' && { label: 'Only videos', icon: Video, next: { ...filters, type: 'VIDEO' } },
    !filters.isFavorite && { label: 'Favorites', icon: Heart, next: { ...filters, isFavorite: true } },
    // smart search ranks by similarity, so ordering only applies without a visual query
    !filters.query && filters.order !== 'asc' && (!filters.intent || filters.intent === 'search') &&
      { label: 'Oldest first', icon: ArrowDownUp, next: { ...filters, order: 'asc' as const } },
    !filters.query && { label: filters.intent === 'random' ? 'Shuffle again' : 'Shuffle', icon: Shuffle, next: { ...omit(filters, 'order'), intent: 'random' as const } },
  ].filter(Boolean) as { label: string; icon: LucideIcon; next: IFindFilters }[];

  return (
    <div className={cn('flex flex-col gap-2', disabled && 'pointer-events-none')}>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence mode="popLayout" initial>
            {chips.map((chip, index) => (
              <motion.span
                key={chip.key}
                layout
                initial={{ opacity: 0, scale: 0.7, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 500, damping: 26, delay: index * 0.04 } }}
                exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15 } }}
                className={cn(
                  'group inline-flex items-center gap-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 py-0.5 pr-1 text-xs',
                  chip.personId ? 'pl-0.5' : 'pl-2.5'
                )}
              >
                {chip.personId
                  ? <PersonFace id={chip.personId} className="h-5 w-5" />
                  : chip.icon && <chip.icon className="h-3 w-3 text-blue-600 dark:text-blue-400" />}
                {!chip.personId && <span className="font-medium text-blue-600 dark:text-blue-400">{chip.label}</span>}
                {chip.value && <span className={chip.personId ? 'font-medium text-foreground' : 'text-muted-foreground'}>{chip.value}</span>}
                <button
                  type="button"
                  onClick={() => onChange(chip.without)}
                  aria-label={`Remove ${chip.label} ${chip.value || ''}`}
                  className="rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-blue-500/20 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}

      {alternatives.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Did you mean</span>
          {alternatives.map((alternative) => (
            <button
              key={alternative.id}
              type="button"
              onClick={() => onChange({
                ...filters,
                personIds: (filters.personIds || []).map((id) => id === alternative.chosenId ? alternative.id : id),
              })}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pl-0.5 pr-2.5 transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground"
            >
              <PersonFace id={alternative.id} className="h-5 w-5" />
              {alternative.name}
            </button>
          ))}
          <span>?</span>
        </div>
      )}

      {refinements.length > 0 && turn.assets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {refinements.map((refinement) => (
            <button
              key={refinement.label}
              type="button"
              onClick={() => onChange(refinement.next)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:border-foreground/30 hover:bg-accent hover:text-foreground"
            >
              <refinement.icon className="h-3 w-3" />
              {refinement.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// "84 photos of Sai & Ravi in Goa"
export const describeTurn = ({ filters, labels, assets, total }: IFindTurn) => {
  const count = total ?? assets.length;
  const single = count === 1;
  const noun = filters.type === 'VIDEO' ? (single ? 'video' : 'videos')
    : filters.type === 'IMAGE' ? (single ? 'photo' : 'photos')
    : (single ? 'item' : 'items');
  const people = (filters.personIds || []).map((id) => labels[id]).filter(Boolean);
  const place = filters.city || filters.state || filters.country;
  return [
    filters.intent === 'largest' ? `Your ${count} largest ${noun}` : `${count.toLocaleString()} ${filters.isFavorite ? 'favorite ' : ''}${noun}`,
    people.length > 0 && `of ${people.join(' & ')}`,
    filters.query && `matching “${filters.query}”`,
    place && `in ${place}`,
    filters.onThisDay && 'from this day in past years',
  ].filter(Boolean).join(' ');
}
