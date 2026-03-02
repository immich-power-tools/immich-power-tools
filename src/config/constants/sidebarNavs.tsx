import { Copy, GalleryHorizontal, GalleryVerticalEnd, Image as ImageIcon, MapPin, MapPinX, Rewind, Search, Share2, User, Video   } from "lucide-react";

export const sidebarNavs = [
  // {
  //   title: "Rewind 2024",
  //   link: "/rewind",
  //   icon: <Rewind className="h-4 w-4" />,
  // },
  {
    title: "Find Assets",
    link: "/find",
    icon: <Search className="h-4 w-4" />,
  },
  {
    title: "Manage People",
    link: "/",
    icon: <User className="h-4 w-4" />,
  },
  {
    title: "Analytics",
    link: "/analytics/exif",
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    title: "Potential Albums",
    link: "/albums/potential-albums",
    icon: <GalleryVerticalEnd className="h-4 w-4" />,
  },
  {
    title: "Missing Locations",
    link: "/assets/missing-locations",
    icon: <MapPinX className="h-4 w-4" />,
  },
  {
    title: "Manage Albums",
    link: "/albums",
    icon: <GalleryHorizontal className="h-4 w-4" />,
  },
  {
    title: "Import shared",
    link: "/assets/import-shared",
    icon: <Share2 className="h-4 w-4" />,
  },

  {
    title: "Geo Heatmap",
    link: "/assets/geo-heatmap",
    icon: <MapPin className="h-4 w-4" />,
  },
  // Empty Videos
  {
    title: "Empty Videos",
    link: "/assets/empty-videos", 
    icon: <Video className="h-4 w-4" />,
  },
  // Bulk Duplicate
  {
    title: "Bulk Duplicate Finder",
    link: "/assets/bulk-duplicate-finder",
    icon: <Copy className="h-4 w-4" />,
  },
  
];
