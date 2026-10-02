import React, { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { THINKING_STAGES, THINKING_TAIL_CHARS } from '@/config/constants/find.constant'

// Deliberately still: the bouncing dots carry the "working on it" signal, so
// the avatar only eases its colour to blue while thinking. React.memo keeps it
// off the render path unless `thinking` actually flips.
export const AiAvatar = React.memo(function AiAvatar({ thinking }: { thinking?: boolean }) {
  return (
    <div className="relative h-8 w-8 shrink-0">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-full border bg-card shadow-sm">
        <Sparkles
          className={cn(
            'h-4 w-4 transition-colors duration-300',
            thinking ? 'text-blue-500' : 'text-foreground'
          )}
        />
      </div>
    </div>
  );
});

// Static, so the dots keep their own CSS timeline no matter how often the
// text beside them changes.
const ThinkingDots = React.memo(function ThinkingDots() {
  return (
    <div className="mt-1 flex shrink-0 gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-thinking-dot"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
});

export const ThinkingIndicator = ({ thinkingText }: { thinkingText?: string }) => {
  const [seconds, setSeconds] = useState(0);
  const live = thinkingText?.trim();
  // A boolean, not the text itself: depending on the text would tear down and
  // rebuild the interval on every streamed chunk.
  const hasLive = !!live;

  // Only the filler needs a clock; once real thinking streams in, stop
  // re-rendering on a timer as well.
  useEffect(() => {
    if (hasLive) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [hasLive]);

  const stage = [...THINKING_STAGES].reverse().find(({ after }) => seconds >= after) || THINKING_STAGES[0];
  const displayText = live
    ? (live.length > THINKING_TAIL_CHARS ? `…${live.slice(-THINKING_TAIL_CHARS)}` : live)
    : stage.text;

  return (
    <div className="flex w-fit max-w-md items-start gap-3 rounded-2xl rounded-tl-md border bg-card px-4 py-3 sm:max-w-lg">
      <ThinkingDots />
      {/* Plain, static text: the bouncing dots are the only motion here */}
      <span className={cn('text-sm leading-snug text-muted-foreground', live && 'line-clamp-3 italic')}>
        {displayText}
      </span>
    </div>
  );
};
