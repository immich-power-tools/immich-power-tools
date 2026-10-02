import FindInput from '@/components/find/FindInput';
import FindTurn from '@/components/find/FindTurn';
import PageLayout from '@/components/layouts/PageLayout';
import Header from '@/components/shared/Header';
import { useConfig } from '@/contexts/ConfigContext';
import { LOGO_COLORS } from '@/config/constants/brand';
import { findAssets } from '@/handlers/api/find.handler';
import Image from 'next/image';
import {
  Plus,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion';
import FloatingBar from "@/components/shared/FloatingBar";
import AssetsBulkDeleteButton from "@/components/shared/AssetsBulkDeleteButton";
import PhotoSelectionContext, { IPhotoSelectionContext } from '@/contexts/PhotoSelectionContext';
import AlbumSelectorDialog from '@/components/albums/AlbumSelectorDialog';
import { addAssetToAlbum, createAlbum } from '@/handlers/api/album.handler';
import { IAlbum, IAlbumCreate } from '@/types/album';
import { IFindFilters, IFindResponse, IFindTurn } from '@/types/find';
import { IPerson } from '@/types/person';
import { listPeople } from '@/handlers/api/people.handler';
import { PERSON_THUBNAIL_PATH } from '@/config/routes';
import { CHAT_PLACEHOLDERS, FIND_SUGGESTIONS, HERO_PLACEHOLDERS, personSuggestions, pop, rise, softSpring, spring, stagger } from '@/config/constants/find.constant';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';


const PrivacyNote = ({ className }: { className?: string }) => (
  <p className={"flex items-center justify-center gap-1.5 text-xs text-muted-foreground " + (className || '')}>
    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
    <span>Only your typed query reaches your AI model. Photos or videos are never sent.</span>
  </p>
);


export default function FindPage() {
  const { toast } = useToast();
  const { aiEnabled } = useConfig();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<IFindTurn[]>([]);
  const [topPeople, setTopPeople] = useState<IPerson[]>([]);
  // Deliberately kept out of `turns`: every streamed chunk would otherwise
  // rewrite that array, and the effect below would push a new asset list into
  // the shared selection context, re-rendering every grid on screen dozens of
  // times per query.
  const [thinkingText, setThinkingText] = useState('');
  const turnIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const thinkingBufferRef = useRef('');
  const thinkingFrameRef = useRef<number | null>(null);
  // Read inside stable callbacks that must not be rebuilt when `loading` flips
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  const [contextState, setContextState] = useState<IPhotoSelectionContext>({
    selectedIds: [],
    assets: [],
    config: {},
    updateContext: (newConfig: Partial<IPhotoSelectionContext>) => {
      setContextState(prevState => ({
        ...prevState,
        ...newConfig,
        config: newConfig.config ? { ...prevState.config, ...newConfig.config } : prevState.config
      }));
    }
  });

  const updateContext = contextState.updateContext;

  // Keep the shared selection context in sync with everything on screen
  useEffect(() => {
    updateContext({ assets: turns.flatMap((turn) => turn.assets) });
  }, [turns, updateContext]);

  useEffect(() => {
    if (!aiEnabled) return;
    listPeople({ page: 1, perPage: 10, sort: 'assetCount', sortOrder: 'desc' })
      .then(({ people }) => setTopPeople(people.filter((person) => person.name).slice(0, 2)))
      .catch(() => {});
  }, [aiEnabled]);

  const suggestions = useMemo(() => [...personSuggestions(topPeople), ...FIND_SUGGESTIONS], [topPeople]);

  // Follow the conversation as turns are added or resolve
  useEffect(() => {
    const id = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 80);
    return () => window.clearTimeout(id);
  }, [turns.length, turns[turns.length - 1]?.status]);

  const patchTurn = (id: number, patch: Partial<IFindTurn>) => {
    setTurns(prev => prev.map(turn => turn.id === id ? { ...turn, ...patch } : turn));
  }

  // Providers that stream token by token can fire far faster than the screen
  // refreshes, so chunks are buffered and flushed once per frame.
  const appendThinking = useCallback((text: string) => {
    thinkingBufferRef.current += text;
    if (thinkingFrameRef.current !== null) return;
    thinkingFrameRef.current = window.requestAnimationFrame(() => {
      thinkingFrameRef.current = null;
      setThinkingText(thinkingBufferRef.current);
    });
  }, []);

  const resetThinking = useCallback(() => {
    if (thinkingFrameRef.current !== null) {
      window.cancelAnimationFrame(thinkingFrameRef.current);
      thinkingFrameRef.current = null;
    }
    thinkingBufferRef.current = '';
    setThinkingText('');
  }, []);

  useEffect(() => () => {
    if (thinkingFrameRef.current !== null) window.cancelAnimationFrame(thinkingFrameRef.current);
  }, []);

  const applyResponse = (id: number, { assets, filters, labels, notes, alternatives, total, error }: IFindResponse) => {
    patchTurn(id, {
      status: error ? 'error' : 'done',
      refreshing: false,
      assets: assets || [],
      filters: filters || {},
      labels: labels || {},
      notes: notes || [],
      alternatives: alternatives || [],
      total,
      error,
    });
  }

  const handleSearch = useCallback((searchQuery: string, displayQuery?: string) => {
    if (!searchQuery.trim() || loading) return;
    const id = ++turnIdRef.current;
    // Lets a follow-up like "only videos" build on the last search
    const previous = [...turns].reverse().find((turn) => turn.status === 'done')?.filters;
    setTurns(prev => [...prev, {
      id,
      displayQuery: (displayQuery || searchQuery).trim(),
      status: 'loading',
      assets: [],
      filters: {},
      labels: {},
      notes: [],
      alternatives: [],
    }]);
    setQuery('');
    setLoading(true);
    resetThinking();
    updateContext({ selectedIds: [] });
    findAssets(searchQuery, { previous, onThinking: appendThinking })
      .then((response: IFindResponse) => applyResponse(id, response))
      .catch((error: any) => {
        patchTurn(id, { status: 'error', error: error.message || error.error || "Failed to fetch assets" });
      })
      .finally(() => {
        setLoading(false);
        resetThinking();
      });
  }, [loading, turns, updateContext, appendThinking, resetThinking]);

  // Removing a chip or tapping a refinement re-runs the turn in place. The
  // filters are already structured, so this skips the AI model entirely.
  const handleFiltersChange = useCallback((id: number, filters: IFindFilters) => {
    if (loadingRef.current) return;
    patchTurn(id, { refreshing: true, filters, alternatives: [] });
    setLoading(true);
    updateContext({ selectedIds: [] });
    findAssets('', { filters })
      .then((response: IFindResponse) => applyResponse(id, response))
      .catch((error: any) => {
        patchTurn(id, { status: 'error', refreshing: false, error: error.message || error.error || "Failed to fetch assets" });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [updateContext]);

  const handleReset = () => {
    setTurns([]);
    setQuery('');
    updateContext({ selectedIds: [], assets: [] });
  }

  // Stable identities, so a memoised turn isn't re-rendered by new callbacks
  const handleSelectionChange = useCallback((ids: string[]) => {
    updateContext({ selectedIds: ids });
  }, [updateContext]);

  const handleDelete = (ids: string[]) => {
    setTurns(prev => prev.map(turn => ({
      ...turn,
      assets: turn.assets.filter((asset) => !ids.includes(asset.id)),
    })));
    updateContext({ selectedIds: [] });
  }

  const handleSelectAlbum = (album: IAlbum) => {
    return addAssetToAlbum(album.id, contextState.selectedIds)
      .then(() => {
        toast({
          title: `Assets added to ${album.albumName}`,
          description: `${contextState.selectedIds.length} assets added to album`,
        });
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Failed to add assets album",
          variant: "destructive",
        });
      });
  };

  const handleCreateAlbum = (formData: IAlbumCreate) => {
    return createAlbum({
      ...formData,
      assetIds: contextState.selectedIds,
    }).then((newAlbum) => {
      toast({
        title: "Album created",
        description: `Album "${newAlbum.albumName}" created successfully with ${contextState.selectedIds.length} assets.`,
      });
    }).catch(() => {
      toast({
        title: "Error creating album",
        description: "Failed to create album",
        variant: "destructive",
      });
    });
  }

  const renderComposer = (docked: boolean) => (
    <motion.div layoutId="find-composer" layout="position" transition={softSpring} className="w-full">
      <FindInput
        value={query}
        onChange={setQuery}
        onSearch={handleSearch}
        loading={loading}
        autoFocus
        dropdownPlacement={docked ? 'top' : 'bottom'}
        placeholders={docked ? CHAT_PLACEHOLDERS : HERO_PLACEHOLDERS}
      />
    </motion.div>
  );

  const renderHero = () => (
    <motion.div
      key="hero"
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4 pb-16"
      variants={stagger}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -24, scale: 0.98, transition: { duration: 0.25, ease: 'easeIn' } }}
    >
      <motion.div variants={rise} className="relative animate-float-slow">
        <motion.div
          className="absolute inset-0 scale-150 rounded-full opacity-50 blur-2xl dark:opacity-40"
          style={{ background: `conic-gradient(from 0deg, ${LOGO_COLORS.join(', ')}, ${LOGO_COLORS[0]})` }}
          animate={{ rotate: 360, scale: [1.5, 1.7, 1.5] }}
          transition={{ rotate: { duration: 14, repeat: Infinity, ease: 'linear' }, scale: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border bg-white shadow-lg">
          <Image src="/favicon.png" alt="Immich Power Tools" width={40} height={40} className="h-10 w-10" />
        </div>
      </motion.div>
      <motion.div variants={rise} className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Find anything in your library
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Just say it: people by name, places, dates, cameras, even text inside a photo.
          Use <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-xs">@</kbd> when you want to pick an exact person.
        </p>
      </motion.div>
      <motion.div variants={rise} className="w-full max-w-2xl">
        {renderComposer(false)}
      </motion.div>
      <motion.div variants={stagger} className="flex max-w-2xl flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <motion.button
            key={suggestion.query}
            variants={pop}
            whileHover={{ y: -3, scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            className="group flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:bg-accent hover:text-foreground hover:shadow-sm"
            onClick={() => handleSearch(suggestion.query, suggestion.displayQuery)}
          >
            {suggestion.personId ? (
              <img src={PERSON_THUBNAIL_PATH(suggestion.personId)} alt="" className="-ml-1.5 h-5 w-5 rounded-full object-cover" />
            ) : suggestion.icon && (
              <suggestion.icon className="h-3.5 w-3.5 text-blue-500" />
            )}
            {suggestion.label}
          </motion.button>
        ))}
      </motion.div>
      <motion.div variants={rise}>
        <PrivacyNote />
      </motion.div>
    </motion.div>
  );

  const renderChat = () => (
    <motion.div
      key="chat"
      className="absolute inset-0 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6">
          {turns.map((turn) => (
            <FindTurn
              key={turn.id}
              turn={turn}
              thinkingText={turn.status === 'loading' ? thinkingText : ''}
              loading={loading}
              onFiltersChange={handleFiltersChange}
              onSelectionChange={handleSelectionChange}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0 bg-gradient-to-t from-background via-background to-transparent pt-4">
        <div className="mx-auto w-full max-w-2xl px-4 pb-3">
          {renderComposer(true)}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.4 } }}>
            <PrivacyNote className="mt-2" />
          </motion.div>
        </div>
      </div>
      <AnimatePresence>
        {contextState.selectedIds.length > 0 && (
          <motion.div
            key="floating-bar"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={spring}
            className="pointer-events-none fixed inset-x-0 bottom-44 z-50 flex justify-center px-4 md:left-[200px] lg:left-[240px]"
          >
            <FloatingBar className="pointer-events-auto !static w-full">
              <p className="text-sm text-muted-foreground">
                {contextState.selectedIds.length} Selected
              </p>
              <div className="flex items-center gap-2">
                <AlbumSelectorDialog onSelected={handleSelectAlbum} onSubmit={handleCreateAlbum} />
                <div className="h-[10px] w-[1px] bg-zinc-500 dark:bg-zinc-600"></div>
                <AssetsBulkDeleteButton
                  selectedIds={contextState.selectedIds}
                  onDelete={handleDelete}
                />
              </div>
            </FloatingBar>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  const renderAiDisabled = () => (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-10">
      <WandSparkles className="h-10 w-10 text-muted-foreground" />
      <p className="text-lg font-semibold">AI parsing is not enabled</p>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Currently, the Power Tools Find relies on an OpenAI-compatible API for parsing the query.
        Please configure <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-xs">AI_API_KEY</kbd> and <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-xs">AI_MODEL</kbd> in the <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-xs">.env</kbd> file.
      </p>
      <div className="mt-2 rounded-md border border-l-4 p-2">
        <PrivacyNote />
      </div>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <PageLayout className="gap-0">
        <Header
          leftComponent="Find"
          rightComponent={
            <AnimatePresence>
              {turns.length > 0 && (
                <motion.div
                  key="new-search"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={spring}
                >
                  <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    New search
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          }
        />
        {aiEnabled ? (
          <PhotoSelectionContext.Provider value={{ ...contextState, updateContext }}>
            <LayoutGroup>
              <div className="relative min-h-0 flex-1">
                <AnimatePresence>
                  {turns.length === 0 ? renderHero() : renderChat()}
                </AnimatePresence>
              </div>
            </LayoutGroup>
          </PhotoSelectionContext.Provider>
        ) : renderAiDisabled()}
      </PageLayout>
    </MotionConfig>
  )
}
