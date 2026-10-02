import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info, SearchX, TriangleAlert } from 'lucide-react'
import AssetGrid from '@/components/shared/AssetGrid'
import FindFilters, { describeTurn } from '@/components/find/FindFilters'
import { AiAvatar, ThinkingIndicator } from '@/components/find/FindThinking'
import { rise, softSpring, spring, stagger } from '@/config/constants/find.constant'
import { IFindFilters, IFindTurn } from '@/types/find'

interface FindTurnProps {
  turn: IFindTurn;
  // Empty for any turn that isn't the one currently loading, so a finished
  // turn's props never change while the next answer streams in — React.memo
  // then skips its whole subtree, asset grid included.
  thinkingText: string;
  loading: boolean;
  onFiltersChange: (id: number, filters: IFindFilters) => void;
  onSelectionChange: (ids: string[]) => void;
}

const FindTurn = React.memo(function FindTurn({
  turn,
  thinkingText,
  loading,
  onFiltersChange,
  onSelectionChange,
}: FindTurnProps) {
  const renderResponse = () => {
    if (turn.status === 'loading') {
      return (
        <motion.div key="thinking" variants={rise} initial="hidden" animate="show"
          exit={{ opacity: 0, scale: 0.9, y: -6, transition: { duration: 0.18 } }}>
          <ThinkingIndicator thinkingText={thinkingText} />
        </motion.div>
      );
    }
    if (turn.status === 'error') {
      return (
        <motion.div key="error" variants={rise} initial="hidden" animate="show"
          className="flex w-fit max-w-xl items-start gap-3 rounded-2xl rounded-tl-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-500/10">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Oops, something went wrong</p>
            <p className="text-sm text-muted-foreground">{turn.error}</p>
          </div>
        </motion.div>
      );
    }
    return (
      <motion.div key="done" className="flex min-w-0 flex-1 flex-col gap-3"
        variants={stagger} initial="hidden" animate="show">
        <FindFilters
          turn={turn}
          disabled={loading}
          onChange={(filters) => onFiltersChange(turn.id, filters)}
        />
        {turn.notes.map((note) => (
          <motion.p key={note} variants={rise} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
            {note}
          </motion.p>
        ))}
        {turn.filters.intent === 'count' && turn.total !== undefined && (
          <motion.div variants={rise} className="flex w-fit items-baseline gap-2 rounded-2xl rounded-tl-md border bg-card px-5 py-3">
            <span className="text-4xl font-bold tabular-nums tracking-tight">{turn.total.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">{describeTurn(turn).replace(/^[\d,.\s]+/, '')}</span>
          </motion.div>
        )}
        {turn.assets.length === 0 ? (
          <motion.div variants={rise} className="flex w-fit items-center gap-3 rounded-2xl rounded-tl-md border bg-card px-4 py-3">
            <SearchX className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No matches for that one. Try removing a filter above or rephrasing.
            </p>
          </motion.div>
        ) : (
          <>
            <motion.p variants={rise} className="text-xs text-muted-foreground">
              {turn.filters.intent === 'count'
                ? `Here are the first ${turn.assets.length}`
                : describeTurn({ ...turn, total: undefined })}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
              animate={{ opacity: turn.refreshing ? 0.4 : 1, y: 0, filter: turn.refreshing ? 'blur(2px)' : 'blur(0px)' }}
              transition={{ ...softSpring, delay: turn.refreshing ? 0 : 0.15 }}
            >
              <AssetGrid
                assets={turn.assets}
                selectable
                onSelectionChange={onSelectionChange}
              />
            </motion.div>
          </>
        )}
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring}
          style={{ transformOrigin: 'bottom right' }}
          className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm"
        >
          {turn.displayQuery}
        </motion.div>
      </div>
      <motion.div
        className="flex items-start gap-3"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...spring, delay: 0.12 }}
      >
        <AiAvatar thinking={turn.status === 'loading' || !!turn.refreshing} />
        <AnimatePresence mode="wait" initial={false}>
          {renderResponse()}
        </AnimatePresence>
      </motion.div>
    </div>
  );
});

export default FindTurn
