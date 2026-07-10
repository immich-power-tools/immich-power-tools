/* eslint-disable @next/next/no-img-element */
import { humanizeDuration } from '@/helpers/string.helper'
import { PlayIcon } from '@radix-ui/react-icons'
import { CircleCheck } from 'lucide-react'
import React, { useEffect } from 'react'
import type { RenderImageProps } from 'react-photo-album'
import type { AssetPhoto } from '../shared/AssetGrid'

interface LazyGridImageProps {
  imageProps: RenderImageProps;
  photo: AssetPhoto;
  width: number;
  height: number;
  selectable?: boolean;
  onSelect?: (event: React.MouseEvent) => void;
  /** When true, dim non-selected siblings so the selected set is visible in dense grids. */
  selectionMode?: boolean;
}

export default function LazyGridImage({ imageProps, photo, width, height, selectable, onSelect, selectionMode = false }: LazyGridImageProps) {
  const [isVisible, setIsVisible] = React.useState(false)
  const imageRef = React.useRef<HTMLDivElement>(null)

  const setupObserver = () => {
    const observer = new IntersectionObserver((entries) => {

      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      })
    })

    if (imageRef.current)  {
      observer.observe(imageRef.current)
    }
    return observer
  }

  useEffect(() => {
    const observer = setupObserver()
    return () => {
      observer?.disconnect()
    }
  }, [])

  if (!isVisible) return (
    <div style={{ height, width }} ref={imageRef} />
  )

  const dim = selectionMode && !photo.isSelected ? 'opacity-60' : '';

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
      }}
      className={`group ${photo.isSelected ? 'ring-4 ring-blue-500 ring-inset' : ''} ${dim}`.trim()}
    >
      <img {...imageProps} alt={imageProps.alt || ""} title="" style={{ ...imageProps.style, width, height, objectFit: 'cover' }} />
      {photo.isVideo && <div className="absolute bottom-2 right-2 bg-black/50 p-1 rounded-full flex items-center gap-1">
        <PlayIcon className="w-3 h-3 text-white" />
        {!!photo.duration && <span className="text-xs text-white">{humanizeDuration(photo.duration)}</span>}
      </div>}
      {selectable && (
        <div
          className={`absolute top-2 left-2 z-10 cursor-pointer transition-opacity ${photo.isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(e);
          }}
        >
          <div className={`rounded-full p-0.5 ${photo.isSelected ? 'bg-blue-500 text-white' : 'bg-black/20 text-white/50'}`}>
            <CircleCheck className="w-5 h-5" />
          </div>
        </div>
      )}
    </div>
  )
}
