import Header from '@/components/shared/Header'
import React, { useState } from 'react'
import PageLayout from '@/components/layouts/PageLayout';
import { IHeatMapParams } from '@/handlers/api/asset.handler';
import { useTheme } from 'next-themes';
import { X } from 'lucide-react';
import AlbumDropdown from '@/components/shared/AlbumDropdown';
import PeopleDropdown from '@/components/shared/PeopleDropdown';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';

// Dynamically import the MapLibreHeatMap component to avoid SSR issues
const MapLibreHeatMap = dynamic(() => import('../../components/MapLibreHeatMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center">Loading map...</div>
});

export default function GeoHeatmap() {
  const { theme } = useTheme();
  const [filters, setFilters] = useState<{
    albumIds?: string
    peopleIds?: string
  }>({ });
  const [isLoading, setIsLoading] = useState(false);


  return (
    <PageLayout className="!p-0 !mb-0">
      <Header 
        leftComponent="Geo Heatmap" 
        rightComponent={
          <>
            <AlbumDropdown 
              albumIds={filters.albumIds ? [filters.albumIds] : []} 
              onChange={(albumIds) => {
                setFilters({
                  ...filters,
                  albumIds: albumIds?.[0]
                })
              }} 
            />
            <PeopleDropdown 
              peopleIds={filters.peopleIds ? [filters.peopleIds] : []} 
              onChange={(peopleIds) => {
                setFilters({
                  ...filters,
                  peopleIds: peopleIds?.[0]
                })
              }} 
            />
            <Button
              variant="default"
              size="sm"
              // Check values, not key presence — deselecting a dropdown leaves
              // its key behind as undefined, which kept Clear lit with no filter.
              disabled={(!filters.albumIds && !filters.peopleIds) || isLoading}
              onClick={() => setFilters({})}>
              <X size={16} /> Clear
            </Button>
          </>
        } 
      />
      <div className='h-full w-full'>
        <MapLibreHeatMap
          filters={filters}
          isDarkMode={theme === 'dark'}
          onLoadingChange={setIsLoading}
        />
      </div>
    </PageLayout>
  )
}
