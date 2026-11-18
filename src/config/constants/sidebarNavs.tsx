import { Copy, GalleryHorizontal, GalleryVerticalEnd, Image as ImageIcon, MapPin, MapPinX, PackageSearch, Rewind, Search, Settings, Share2, Tags, User, Video, Workflow } from "lucide-react";

interface SidebarNav {
  title: string;
  link: string;
  icon: React.ReactNode;
  badge?: string;
}

interface SidebarGroup {
  label: string;
  items: SidebarNav[];
}

export const sidebarGroups: SidebarGroup[] = [
  {
    label: "Library",
    items: [
      { title: "Find Assets", link: "/find", icon: <Search className="h-4 w-4" /> },
      { title: "Manage People", link: "/", icon: <User className="h-4 w-4" /> },
      { title: "Manage Albums", link: "/albums", icon: <GalleryHorizontal className="h-4 w-4" /> },
      { title: "Analytics", link: "/analytics/exif", icon: <ImageIcon className="h-4 w-4" /> },
    ],
  },
  {
    label: "Tools",
    items: [
      { title: "Potential Albums", link: "/albums/potential-albums", icon: <GalleryVerticalEnd className="h-4 w-4" /> },
      { title: "Missing Locations", link: "/assets/missing-locations", icon: <MapPinX className="h-4 w-4" /> },
      { title: "Empty Videos", link: "/assets/empty-videos", icon: <Video className="h-4 w-4" /> },
      { title: "Bulk Duplicate Finder", link: "/assets/bulk-duplicate-finder", icon: <Copy className="h-4 w-4" /> },
      { title: "Orphan Finder", link: "/assets/orphan-finder", icon: <PackageSearch className="h-4 w-4" /> },
      { title: "Tag Manager", link: "/tags", icon: <Tags className="h-4 w-4" />, badge: "Beta" },
    ],
  },
  {
    label: "Automation",
    items: [
      { title: "Workflows", link: "/workflows", icon: <Workflow className="h-4 w-4" />, badge: "Beta" },
    ],
  },
  {
    label: "Other",
    items: [
      { title: "Geo Heatmap", link: "/assets/geo-heatmap", icon: <MapPin className="h-4 w-4" /> },
      { title: "Import Shared", link: "/assets/import-shared", icon: <Share2 className="h-4 w-4" /> },
      { title: "Settings", link: "/settings", icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

// Flat list for backward compat (mobile menu)
export const sidebarNavs = sidebarGroups.flatMap((g) => g.items);
