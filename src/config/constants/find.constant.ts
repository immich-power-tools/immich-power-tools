import { Baby, Calendar, CalendarHeart, FolderMinus, HardDrive, Hash, LucideIcon, Shuffle, Users } from 'lucide-react';
import { type Variants } from 'framer-motion';
import { IPerson } from '@/types/person';

export interface IFindSuggestion {
  label: string;
  query: string;
  displayQuery?: string;
  icon?: LucideIcon;
  personId?: string;
}

export const FIND_SUGGESTIONS: IFindSuggestion[] = [
  { label: "On this day", query: "On this day in previous years", icon: CalendarHeart },
  { label: "Surprise me", query: "Surprise me with random favorites", icon: Shuffle },
  { label: "Last week's photos", query: "Photos from last week", icon: Calendar },
  { label: "How many videos this year?", query: "How many videos did I take this year?", icon: Hash },
  { label: "What's taking up space?", query: "What is taking up the most space?", icon: HardDrive },
  { label: "Favorites not in an album", query: "Favorites that are not in any album", icon: FolderMinus },
];

// Built from the people in the library. Running one sends the person's id as
// an @mention rather than their name, so these names never reach the AI model.
export const personSuggestions = (people: IPerson[]): IFindSuggestion[] => {
  const [first, second] = people;
  if (!first) return [];
  return [
    { label: `Photos of ${first.name}`, query: `Photos of @${first.id}`, displayQuery: `Photos of ${first.name}`, personId: first.id },
    ...(first.birthDate
      ? [{ label: `${first.name} as a baby`, query: `@${first.id} as a baby`, displayQuery: `${first.name} as a baby`, icon: Baby }]
      : []),
    ...(second
      ? [{
          label: `${first.name} & ${second.name} together`,
          query: `@${first.id} and @${second.id} together`,
          displayQuery: `${first.name} and ${second.name} together`,
          icon: Users,
        }]
      : []),
  ];
}

export const HERO_PLACEHOLDERS = [
  'Show pictures of…',
  'How many photos did I take in 2023?',
  'Beach sunsets shot on iPhone',
  'Photos with the text “invoice”',
  'Use @ to pick a specific person',
];

export const CHAT_PLACEHOLDERS = [
  'Refine it: “only videos”, “in 2022”, “oldest first”…',
  'Or ask for something new',
];

export const THINKING_STAGES = [
  { after: 0, text: 'Understanding your query…' },
  { after: 5, text: 'Working out the filters…' },
  { after: 15, text: 'Your AI model is taking its time…' },
];

export const spring = { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 28 } as const;

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
};

export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.7, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 500, damping: 26 } },
};

// Some providers (reasoning models like grok-4.6, deepseek-r1...) stream
// their actual chain of thought; most don't. When one does, show it live
// instead of the generic filler — only its tail, so a long thought scrolls
// through rather than growing the bubble indefinitely.
export const THINKING_TAIL_CHARS = 220;
