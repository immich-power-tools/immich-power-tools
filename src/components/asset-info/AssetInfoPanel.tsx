import React, { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { humanizeBytes } from '@/helpers/string.helper'
import { useConfig } from '@/contexts/ConfigContext'
import {
  Calendar,
  Image as ImageIcon,
  Camera,
  Aperture,
  MapPin,
  EyeOff,
  ExternalLink,
  Check,
} from 'lucide-react'
import API from '@/lib/api'
import { PERSON_THUBNAIL_PATH } from '@/config/routes'
import { updatePerson } from '@/handlers/api/people.handler'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useImmichMapStyle } from '@/hooks/useImmichMapStyle'

export interface IAssetDetail {
  id: string
  type: string
  originalPath: string
  originalFileName: string
  isFavorite: boolean
  duration: string | null
  localDateTime: string | Date
  fileCreatedAt: string | Date
  make: string | null
  model: string | null
  lensModel: string | null
  fNumber: number | null
  focalLength: number | null
  iso: number | null
  exposureTime: string | null
  fileSizeInByte: number | null
  exifImageWidth: number | null
  exifImageHeight: number | null
  orientation: string | null
  dateTimeOriginal: string | Date | null
  timeZone: string | null
  latitude: number | null
  longitude: number | null
  city: string | null
  state: string | null
  country: string | null
  description: string | null
  rating: number | null
  fps: number | null
  projectionType: string | null
  people: { personId: string; personName: string; thumbnailPath: string; isHidden: boolean }[]
}

interface AssetInfoPanelProps {
  assetId: string
}

function getMegapixels(width: number, height: number): string {
  const mp = (width * height) / 1_000_000
  return mp >= 1 ? `${mp.toFixed(1)} MP` : `${(mp * 1000).toFixed(0)} KP`
}

function formatExposureTime(exposure: string): string {
  const val = parseFloat(exposure)
  if (isNaN(val)) return exposure
  if (val >= 1) return `${val} s`
  return `1/${Math.round(1 / val)} s`
}

interface PersonChipProps {
  person: { personId: string; personName: string; thumbnailPath: string }
  exImmichUrl: string
  isHidden: boolean
  onUpdate: (updated: { personId: string; personName?: string; hidden?: boolean }) => void
}

function PersonChip({ person: p, exImmichUrl, isHidden: hidden, onUpdate }: PersonChipProps) {
  const [name, setName] = useState(p.personName)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const handleRename = async () => {
    if (name === p.personName) { setOpen(false); return }
    setSaving(true)
    try {
      await updatePerson(p.personId, { name })
      onUpdate({ personId: p.personId, personName: name })
      toast({ title: "Updated", description: `Renamed to "${name}"` })
      setOpen(false)
    } catch {
      toast({ title: "Error", description: "Failed to rename", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleHide = async () => {
    setSaving(true)
    try {
      await updatePerson(p.personId, { isHidden: true })
      onUpdate({ personId: p.personId, hidden: true })
      toast({ title: "Hidden", description: `"${p.personName || 'Unknown'}" hidden` })
      setOpen(false)
    } catch {
      toast({ title: "Error", description: "Failed to hide person", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 px-2 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors"
        >
          <div className="relative h-6 w-6 shrink-0">
            <img
              src={PERSON_THUBNAIL_PATH(p.personId)}
              alt={p.personName}
              className={`h-6 w-6 rounded-full object-cover ${hidden ? 'opacity-40' : ''}`}
            />
            {hidden && (
              <div className="absolute inset-0 flex items-center justify-center">
                <EyeOff className="h-3.5 w-3.5 text-foreground" />
              </div>
            )}
          </div>
          <span className={`text-xs font-medium ${hidden ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{p.personName || 'Unknown'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 z-[10000]" side="bottom" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={PERSON_THUBNAIL_PATH(p.personId)}
              alt={p.personName}
              className="h-16 w-16 rounded-full object-cover"
            />
            <span className="text-sm font-medium truncate">{p.personName || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
            />
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={handleRename} disabled={saving}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <button
              onClick={handleHide}
              disabled={saving}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors w-full text-left"
            >
              <EyeOff className="h-4 w-4" /> Hide person
            </button>
            <a
              href={exImmichUrl + '/people/' + p.personId}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors w-full"
            >
              <ExternalLink className="h-4 w-4" /> Open in Immich
            </a>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MiniMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const styleUrl = useImmichMapStyle(isDark)

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [longitude, latitude],
      zoom: 14,
      scrollZoom: false,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    map.on('load', () => {
      new maplibregl.Marker().setLngLat([longitude, latitude]).addTo(map)
      map.resize()
    })
    // Panel/viewport reflows resize this container with no window event.
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(mapContainerRef.current)

    return () => {
      observer.disconnect()
      map.remove()
    }
  }, [latitude, longitude, styleUrl])

  return (
    <div className="rounded-lg overflow-hidden border h-[160px]">
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  )
}

export default function AssetInfoPanel({ assetId }: AssetInfoPanelProps) {
  const [detail, setDetail] = useState<IAssetDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const { exImmichUrl } = useConfig()

  useEffect(() => {
    setLoading(true)
    setHiddenIds(new Set())
    API.get(`/api/assets/${assetId}/detail`)
      .then((data) => {
        setDetail(data)
        if (data?.people) {
          setHiddenIds(new Set(data.people.filter((p: any) => p.isHidden).map((p: any) => p.personId)))
        }
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [assetId])

  if (loading) {
    return (
      <div className="dark w-full max-h-[45vh] md:max-h-none md:w-[360px] md:min-w-[360px] bg-background text-foreground border-t md:border-t-0 md:border-l overflow-y-auto p-4">
        <h2 className="text-lg font-semibold mb-4">Info</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="dark w-full max-h-[45vh] md:max-h-none md:w-[360px] md:min-w-[360px] bg-background text-foreground border-t md:border-t-0 md:border-l overflow-y-auto p-4">
        <h2 className="text-lg font-semibold mb-4">Info</h2>
        <p className="text-sm text-muted-foreground">Unable to load asset details.</p>
      </div>
    )
  }

  const dateStr = detail.dateTimeOriginal || detail.localDateTime
  const date = dateStr ? new Date(dateStr) : null

  const hasLocation = detail.latitude && detail.longitude
  const locationParts = [detail.city, detail.state, detail.country].filter(Boolean)

  const resolution = detail.exifImageWidth && detail.exifImageHeight
    ? `${detail.exifImageWidth} x ${detail.exifImageHeight}`
    : null
  const megapixels = detail.exifImageWidth && detail.exifImageHeight
    ? getMegapixels(detail.exifImageWidth, detail.exifImageHeight)
    : null

  return (
    <div className="dark w-full max-h-[45vh] md:max-h-none md:w-[360px] md:min-w-[360px] bg-background text-foreground border-t md:border-t-0 md:border-l overflow-y-auto">
      {/* Header */}
      <div className="p-4 pb-2">
        <h2 className="text-lg font-semibold">Info</h2>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Description */}
        {detail.description && (
          <p className="text-sm text-muted-foreground">{detail.description}</p>
        )}

        {/* People */}
        {detail.people && detail.people.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">People</h3>
              <div className="flex items-center gap-2">
                {detail.people.some((p) => !p.personName && !hiddenIds.has(p.personId)) && (
                  <button
                    onClick={async () => {
                      const unnamed = detail.people.filter((p) => !p.personName && !hiddenIds.has(p.personId))
                      try {
                        await Promise.all(unnamed.map((p) => updatePerson(p.personId, { isHidden: true })))
                        setHiddenIds((prev) => { const next = new Set(prev); unnamed.forEach((p) => next.add(p.personId)); return next })
                        toast({ title: "Hidden", description: `Hidden ${unnamed.length} unnamed people` })
                      } catch {
                        toast({ title: "Error", description: "Failed to hide people", variant: "destructive" })
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    title="Hide unnamed people"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Hide unnamed
                  </button>
                )}
                {detail.people.some((p) => !hiddenIds.has(p.personId)) && (
                  <button
                    onClick={async () => {
                      const unhidden = detail.people.filter((p) => !hiddenIds.has(p.personId))
                      try {
                        await Promise.all(unhidden.map((p) => updatePerson(p.personId, { isHidden: true })))
                        setHiddenIds((prev) => { const next = new Set(prev); unhidden.forEach((p) => next.add(p.personId)); return next })
                        toast({ title: "Hidden", description: `Hidden ${unhidden.length} people` })
                      } catch {
                        toast({ title: "Error", description: "Failed to hide people", variant: "destructive" })
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    title="Hide all people"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Hide all
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.people.map((p) => (
                <PersonChip key={p.personId} person={p} exImmichUrl={exImmichUrl} isHidden={hiddenIds.has(p.personId)} onUpdate={(updated) => {
                  if (updated.hidden) {
                    setHiddenIds((prev) => new Set(prev).add(updated.personId))
                  }
                  if (updated.personName !== undefined) {
                    setDetail((prev) => {
                      if (!prev) return prev
                      return { ...prev, people: prev.people.map((pp) => pp.personId === updated.personId ? { ...pp, personName: updated.personName! } : pp) }
                    })
                  }
                }} />
              ))}
            </div>
          </div>
        )}

        <hr className="border-border" />

        {/* Details */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Details</h3>
          <div className="space-y-3">
            {/* Date */}
            {date && (
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {format(date, 'd MMM yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(date, 'EEE, HH:mm:ss')}
                    {detail.timeZone ? ` ${detail.timeZone}` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* File info */}
            <div className="flex items-start gap-3">
              <ImageIcon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{detail.originalFileName}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    megapixels,
                    resolution,
                    detail.fileSizeInByte ? humanizeBytes(detail.fileSizeInByte) : null,
                  ].filter(Boolean).join('  ')}
                </p>
              </div>
            </div>

            {/* Camera */}
            {(detail.make || detail.model) && (
              <div className="flex items-start gap-3">
                <Camera className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {[detail.make, detail.model].filter(Boolean).join(' ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      detail.exposureTime ? formatExposureTime(detail.exposureTime) : null,
                      detail.iso ? `ISO ${detail.iso}` : null,
                    ].filter(Boolean).join('  ')}
                  </p>
                </div>
              </div>
            )}

            {/* Lens */}
            {detail.lensModel && (
              <div className="flex items-start gap-3">
                <Aperture className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium truncate max-w-[280px]">{detail.lensModel}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      detail.fNumber ? `f/${detail.fNumber}` : null,
                      detail.focalLength ? `${detail.focalLength} mm` : null,
                    ].filter(Boolean).join('  ')}
                  </p>
                </div>
              </div>
            )}

            {/* Location */}
            {(locationParts.length > 0 || hasLocation) && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  {locationParts.length > 0 ? (
                    locationParts.map((part, i) => (
                      <p key={i} className={i === 0 ? 'text-sm font-medium' : 'text-xs text-muted-foreground'}>
                        {part}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {detail.latitude?.toFixed(6)}, {detail.longitude?.toFixed(6)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Map */}
            {hasLocation && (
              <MiniMap latitude={detail.latitude!} longitude={detail.longitude!} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
