import { ColumnDef } from "@tanstack/react-table"
import { IAlbum } from "@/types/album"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowUpDown, MoreHorizontal, Calendar, Camera, Users, HardDrive, ImageOff } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDate } from "@/helpers/date.helper"
import { humanizeBytes, humanizeNumber, pluralize } from "@/helpers/string.helper"
import { differenceInDays } from "date-fns"
import Link from "next/link"
import { ASSET_THUMBNAIL_PATH } from "@/config/routes"
import LazyImage from "@/components/ui/lazy-image"

export const albumColumns: ColumnDef<IAlbum>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "albumThumbnailAssetId",
    header: "Thumbnail",
    cell: ({ row }) => {
      const album = row.original
      return (
        <div className="w-16 h-16 rounded-md overflow-hidden">
          {album.albumThumbnailAssetId ? (
            <LazyImage
              src={ASSET_THUMBNAIL_PATH(album.albumThumbnailAssetId)}
              alt={album.albumName}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400">
              <ImageOff size={20} />
            </div>
          )}
        </div>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: "albumName",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Album Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const album = row.original
      return (
        <Link 
          href={`/albums/${album.id}`} 
          className="font-medium hover:underline"
          onClick={(e) => {
            // Ensure the link click is not blocked by table events
            e.stopPropagation()
          }}
        >
          {album.albumName}
        </Link>
      )
    },
  },
  {
    accessorKey: "assetCount",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          <Camera className="mr-2 h-4 w-4" />
          Assets
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const count = row.getValue("assetCount") as number
      return <div className="font-medium">{humanizeNumber(count)}</div>
    },
  },
  {
    accessorKey: "faceCount",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          <Users className="mr-2 h-4 w-4" />
          People
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const count = row.getValue("faceCount") as number
      return <div>{humanizeNumber(count)} {pluralize(count, 'person', 'people')}</div>
    },
  },
  {
    accessorKey: "size",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          <HardDrive className="mr-2 h-4 w-4" />
          Size
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const size = row.getValue("size") as string
      return <div>{humanizeBytes(parseInt(size))}</div>
    },
  },
  {
    accessorKey: "firstPhotoDate",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          <Calendar className="mr-2 h-4 w-4" />
          Date Range
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const album = row.original
      const numberOfDays = (album.firstPhotoDate && album.lastPhotoDate)
        ? differenceInDays(album.lastPhotoDate, album.firstPhotoDate)
        : null

      return (
        <div className="space-y-1">
          <div className="text-sm">
            {album.firstPhotoDate ? formatDate(album.firstPhotoDate.toString(), 'MMM d, yyyy') : ''} - {album.lastPhotoDate ? formatDate(album.lastPhotoDate.toString(), 'MMM d, yyyy') : ''}
          </div>
          {numberOfDays !== null && (
            <div className="text-xs text-muted-foreground">
              {numberOfDays === 0 ? '1 day' : `${numberOfDays.toLocaleString()} days`}
            </div>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as string
      return <div>{formatDate(date, 'MMM d, yyyy')}</div>
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const album = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href={`/albums/${album.id}`}>
                View Album
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              Share Album
            </DropdownMenuItem>
            <DropdownMenuItem>
              Edit Album
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600">
              Delete Album
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
] 