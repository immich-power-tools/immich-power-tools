import FindInput from '@/components/find/FindInput';
import PageLayout from '@/components/layouts/PageLayout';
import Header from '@/components/shared/Header';
import Loader from '@/components/ui/loader';
import { ASSET_PREVIEW_PATH } from '@/config/routes';
import { useConfig } from '@/contexts/ConfigContext';
import { findAssets } from '@/handlers/api/asset.handler';
import { Search, TriangleAlert, WandSparkles } from 'lucide-react';
import React, { useMemo, useState } from 'react'
import AssetGrid from "@/components/shared/AssetGrid";
import FloatingBar from "@/components/shared/FloatingBar";
import AssetsBulkDeleteButton from "@/components/shared/AssetsBulkDeleteButton";
// Context Imports
import PhotoSelectionContext, { IPhotoSelectionContext } from '@/contexts/PhotoSelectionContext';
// Album Imports
import AlbumSelectorDialog from '@/components/albums/AlbumSelectorDialog';
import { addAssetToAlbum, createAlbum } from '@/handlers/api/album.handler';
import { IAlbum, IAlbumCreate } from '@/types/album';
import { useToast } from '@/components/ui/use-toast'; // Import useToast
import { Button } from '@/components/ui/button'; // Import Button

interface IFindFilters {
  [key: string]: string;
}

const FILTER_KEY_MAP = {
  "city": "City",
  "state": "State",
  "country": "Country",
  "takenAfter": "Taken After",
  "takenBefore": "Taken Before",
  "size": "Size",
  "model": "Model",
  "personIds": "People",
}

// Add suggestion list
const SUGGESTIONS = [
  { label: "Last week's photos", query: "Photos from last week" },
  { label: "Photos from last summer", query: "Photos taken last summer" },
  { label: "Videos from New York", query: "Videos taken in New York" },
  { label: "Photos taken in Beach", query: "Photos taken in Berlin" }, // Example with person tag
  { label: "Recent screenshots", query: "Screenshots taken recently" },
];

export default function FindPage() {

  // Remove local selectedIds and assets state
  // const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // const [assets, setAssets] = useState<IAsset[]>([]);
  const { toast } = useToast(); // Initialize toast
  const { aiEnabled } = useConfig();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<IFindFilters>({});
  const [error, setError] = useState<string | null>(null);

  // Initialize context state
  const [contextState, setContextState] = useState<IPhotoSelectionContext>({
    selectedIds: [],
    assets: [],
    config: {},
    updateContext: (newConfig: Partial<IPhotoSelectionContext>) => {
      setContextState(prevState => ({
        ...prevState,
        ...newConfig,
        // No deep merge needed for config here as it's simple
        config: newConfig.config ? { ...prevState.config, ...newConfig.config } : prevState.config
      }));
    }
  });

  const updateContext = contextState.updateContext;

  
  const appliedFilters: {
    label: string;
    value: string;
  }[] = useMemo(() => {
    return Object.entries(filters)
      .filter(([_key, value]) => {
        if (Array.isArray(value)) {
          return value.length > 0;
        }
        return value !== undefined && value !== null && value !== '';
      })
      .map(([key, value]) => ({
        label: key,
        value: Array.isArray(value) ? value.join(', ') : value,
      }))
      .filter((filter) => filter.label !== "query");
  }, [filters]);

  const handleSearch = (query: string) => {
    setQuery(query);
    setLoading(true);
    setError(null); // Clear previous errors
    findAssets(query)
      .then(({ assets, filters: _filters }) => {
        // Update context state with fetched assets
        updateContext({ assets: assets, selectedIds: [] });
        setFilters(_filters);
      })
      .catch((error: any) => {
        setError(error.message || error.error || "Failed to fetch assets");
        updateContext({ assets: [], selectedIds: [] }); // Clear assets on error
      })
      .finally(() => {
        setLoading(false);
      });
  }

  // Update handleSelectionChange to use context
  const handleSelectionChange = (ids: string[]) => {
    updateContext({ selectedIds: ids });
  }

  // Update handleDelete to use context
  const handleDelete = (ids: string[]) => {
    const newAssets = contextState.assets.filter((asset) => !ids.includes(asset.id));
    updateContext({ selectedIds: [], assets: newAssets });
  }

  // --- Album Handling Logic (Adapted from potential-albums.tsx) ---
  const handleSelectAlbum = (album: IAlbum) => {
    return addAssetToAlbum(album.id, contextState.selectedIds)
      .then(() => {
        toast({
          title: `Assets added to ${album.albumName}`,
          description: `${contextState.selectedIds.length} assets added to album`,
        });
        // Optionally clear selection or remove assets from view if needed
        // updateContext({ selectedIds: [] });
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
    }).then((newAlbum) => { // Assuming createAlbum returns the new album
      toast({
        title: "Album created",
        description: `Album "${newAlbum.albumName}" created successfully with ${contextState.selectedIds.length} assets.`, // Provide more detail
      });
      // Optionally clear selection or remove assets from view
      // updateContext({ selectedIds: [] });
    }).catch(() => {
      toast({
        title: "Error creating album",
        description: "Failed to create album",
        variant: "destructive",
      });
    });
  }
  // --- End Album Handling Logic ---

  const renderFilters = () => {
    if (appliedFilters.length === 0) return null;
    return (
      <div className="flex gap-2 flex-wrap px-2">
        {appliedFilters.map((filter) => (
          <div key={filter.label} className="flex gap-2 items-center divide-x divide-gray-400 dark:divide-zinc-800 bg-zinc-100 dark:bg-zinc-800 border border-gray-400 dark:border-zinc-800 rounded-md px-2">
            <p className="text-sm text-gray-500 dark:text-zinc-400">{FILTER_KEY_MAP[filter.label as keyof typeof FILTER_KEY_MAP] || filter.label}</p>
            <p className="text-sm text-gray-500 dark:text-zinc-400 pl-1.5">{filter.value}</p>
          </div>
        ))}
      </div>
    )
  }

  const renderContent = () => {
    if (loading) {
      return <div className="flex justify-center items-center h-full">
        <Loader />
      </div>
    }
    else if (error) {
      return (
        <div className="flex justify-center items-center h-full flex-col gap-2">
          <TriangleAlert className='w-10 h-10 text-muted-foreground' />
          <p className='text-lg font-bold'>Oops, something went wrong</p>
          <p className='text-sm text-muted-foreground max-w-md text-center'>
            Error: {error}
          </p>
        </div>
      )
    }
    else if (query.length === 0) {
      return (
        <div className="flex justify-center flex-col gap-2 items-center h-full">
          <Search className='w-10 h-10 text-muted-foreground' />
          <p className='text-lg font-bold'>Search for photos in natural language</p>
          <p className='text-sm text-muted-foreground text-center max-w-lg'> {/* Centered and max-width */}
            Example: <kbd className='bg-zinc-200 text-black dark:text-white px-1 py-0.5 rounded-md dark:bg-zinc-500'>Sunset photos from last week</kbd>. Use <kbd className='bg-zinc-200 text-black dark:text-white px-1 py-0.5 rounded-md dark:bg-zinc-500'>@</kbd> to search for photos of a specific person.
          </p>
          {/* Render suggestions */}
          <div className="flex flex-wrap gap-2 justify-center mt-4 max-w-lg">
            {SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion.query}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handleSearch(suggestion.query)}
              >
                {suggestion.label}
              </Button>
            ))}
          </div>
          <p className='text-xs text-muted-foreground text-center flex gap-1 items-center mt-4'> {/* Adjusted margin top */}
            <span>Power tools uses your configured AI model only for parsing your query. None of your library data is sent to the AI provider.</span>
          </p>
        </div>
      )
    }
    // Use contextState.assets for the check
    else if (contextState.assets.length === 0) {
      return <div className="flex justify-center items-center h-full flex-col gap-2">
        <TriangleAlert className='w-10 h-10 text-muted-foreground' />
        <p className='text-lg font-bold'>No results found for the below filters</p>
        {appliedFilters.length > 0 && // Show filters only if they exist
          <div className='text-sm text-muted-foreground mt-2'> {/* Added margin top */}
            {renderFilters()}
          </div>
        }
      </div>
    }

    // Wrap grid and floating bar with Context Provider
    return (
      <PhotoSelectionContext.Provider value={{ ...contextState, updateContext }}>
        <div className="flex flex-col gap-4"> {/* Added gap */}
          {renderFilters()}
          <div className="w-full">
            {/* Pass context assets and selection handler */}
            <AssetGrid
              assets={contextState.assets}
              selectable
              onSelectionChange={handleSelectionChange}
            />
            {/* Use contextState.selectedIds for FloatingBar condition and props */}
            {contextState.selectedIds.length > 0 && (
              <FloatingBar>
                <p className="text-sm text-muted-foreground">
                  {contextState.selectedIds.length} Selected
                </p>
                <div className="flex items-center gap-2"> {/* Container for buttons */}
                  {/* Add AlbumSelectorDialog */}
                  <AlbumSelectorDialog onSelected={handleSelectAlbum} onSubmit={handleCreateAlbum} />
                  <div className="h-[10px] w-[1px] bg-zinc-500 dark:bg-zinc-600"></div> {/* Separator */}
                  <AssetsBulkDeleteButton
                    selectedIds={contextState.selectedIds}
                    onDelete={handleDelete}
                  />
                </div>
              </FloatingBar>
            )}
          </div>
        </div>
      </PhotoSelectionContext.Provider>
    )
  }

  return (
    <PageLayout className="pb-20">
      <Header leftComponent="Find" />
      {aiEnabled ? (
        <>
          <div className="flex flex-col gap-4 p-2">
            <FindInput 
              value={query}
              onChange={setQuery}
              onSearch={handleSearch} 
            />
          </div>
          {/* renderContent now includes the Provider */}
          {renderContent()}
        </>
      ) : (
        <div className="flex justify-center py-10 items-center h-full flex-col gap-2">
          <WandSparkles className='w-10 h-10 text-muted-foreground' />
          <p className='text-lg font-semibold'>AI parsing is not enabled</p>
          <p className='text-sm text-muted-foreground max-w-md text-center'>
            Currently, the Power Tools Find relies on an OpenAI-compatible API for parsing the query.
            Please configure <kbd className='bg-zinc-200 text-black dark:text-white px-1 py-0.5 rounded-md dark:bg-zinc-500'>AI_API_KEY</kbd> and <kbd className='bg-zinc-200 text-black dark:text-white px-1 py-0.5 rounded-md dark:bg-zinc-500'>AI_MODEL</kbd> in the <kbd className='bg-zinc-200 text-black dark:text-white px-1 py-0.5 rounded-md dark:bg-zinc-500'>.env</kbd> file.
          </p>
          <div className="border border-l-4 border-zinc-200 dark:border-zinc-500 rounded-md p-2">
            <p className='text-xs text-muted-foreground text-center flex gap-1 items-center'>
              <span>Power tools uses your configured AI model only for parsing your query. None of your library data is sent to the AI provider.</span>
            </p>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
