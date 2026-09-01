import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import EXIFDistribution, {
  IEXIFDistributionProps,
} from "@/components/analytics/exif/EXIFDistribution";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import AssetHeatMap from "@/components/analytics/exif/AssetHeatMap";
import PeopleNamesChart from "@/components/analytics/exif/PeopleNamesChart";
import GeoPhotosChart from "@/components/analytics/exif/GeoPhotosChart";
import AlbumPhotosChart from "@/components/analytics/exif/AlbumPhotosChart";
import { useEffect, useState } from "react";
import { getAssetStatistics, getLivePhotoStatistics } from "@/handlers/api/analytics.handler";
import { humanizeBytes } from "@/helpers/string.helper";
import {
  Camera,
  Image as ImageIcon,
  Video,
  Aperture,
  MapPin,
  SlidersHorizontal,
  BarChart3,
  Users,
  Globe,
  FolderOpen,
} from "lucide-react";

const cameraCharts: IEXIFDistributionProps[] = [
  {
    column: "make",
    title: "Make",
    description: "Camera manufacturer breakdown",
  },
  {
    column: "model",
    title: "Model",
    description: "Camera model breakdown",
  },
  {
    column: "lensModel",
    title: "Lens Model",
    description: "Lens usage across your library",
  },
];

const locationCharts: IEXIFDistributionProps[] = [
  {
    column: "city",
    title: "City",
    description: "Top cities by photo count",
  },
  {
    column: "state",
    title: "State",
    description: "Top states by photo count",
  },
  {
    column: "country",
    title: "Country",
    description: "Top countries by photo count",
  },
];

const technicalCharts: IEXIFDistributionProps[] = [
  {
    column: "focal-length",
    title: "Focal Length",
    description: "Focal length distribution",
  },
  {
    column: "iso",
    title: "ISO",
    description: "ISO sensitivity distribution",
  },
  {
    column: "exposureTime",
    title: "Exposure Time",
    description: "Shutter speed distribution",
  },
  {
    column: "projectionType",
    title: "Projection Type",
    description: "Image projection types",
  },
];

const storageChart: IEXIFDistributionProps = {
  column: "storage",
  title: "Storage",
  description: "Storage usage by user",
  tooltipValueFormatter: (value) => humanizeBytes(value as number * 1000000),
};

interface StatCardProps {
  label: string;
  value: number;
  loading: boolean;
  icon: React.ReactNode;
  accent: string;
}

function StatCard({ label, value, loading, icon, accent }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-5 transition-all duration-300 hover:shadow-md">
      <div className={`absolute inset-0 opacity-[0.03] ${accent}`} />
      <div className="relative flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {loading ? (
              <span className="inline-block h-8 w-20 animate-pulse rounded bg-muted" />
            ) : (
              value.toLocaleString()
            )}
          </p>
        </div>
        <div className={`rounded-lg p-2.5 ${accent} bg-opacity-10 text-opacity-80`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function SectionHeader({ icon, title, description }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-2">
      <div className="flex items-center justify-center rounded-lg bg-muted p-2 text-muted-foreground">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function ExifDataAnalytics() {
  const [statistics, setStatistics] = useState({ images: 0, videos: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [livePhotoStatistics, setLivePhotoStatistics] = useState({ total: 0 });

  const fetchLivePhotoStatistics = async () => {
    setLoading(true);
    try {
      const data = await getLivePhotoStatistics();
      const livePhotoData = Array.isArray(data) && data.length ? data[0].value : 0;
      setLivePhotoStatistics({ total: livePhotoData });
    } finally {
      setLoading(false);
    }
  };

  const fetchStatisticsData = async () => {
    setLoading(true);
    try {
      const data = await getAssetStatistics();
      setStatistics(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatisticsData();
    fetchLivePhotoStatistics();
  }, []);

  return (
    <PageLayout className="!p-0 !mb-0 relative">
      <Header leftComponent="Analytics" />
      <div className="p-5 space-y-8">
        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Assets"
            value={statistics.total}
            loading={loading}
            icon={<BarChart3 className="h-5 w-5" />}
            accent="bg-blue-500 text-blue-600"
          />
          <StatCard
            label="Images"
            value={statistics.images}
            loading={loading}
            icon={<ImageIcon className="h-5 w-5" />}
            accent="bg-emerald-500 text-emerald-600"
          />
          <StatCard
            label="Videos"
            value={statistics.videos}
            loading={loading}
            icon={<Video className="h-5 w-5" />}
            accent="bg-orange-500 text-orange-600"
          />
          <StatCard
            label="Live Photos"
            value={livePhotoStatistics.total}
            loading={loading}
            icon={<Aperture className="h-5 w-5" />}
            accent="bg-violet-500 text-violet-600"
          />
        </div>

        {/* ── Activity Heatmap ── */}
        <section>
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            title="Activity"
            description="Photo capture frequency over the past year"
          />
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <AssetHeatMap />
            </CardContent>
          </Card>
        </section>

        {/* ── Library Overview ── */}
        <section>
          <SectionHeader
            icon={<SlidersHorizontal className="h-4 w-4" />}
            title="Library Overview"
            description="High-level stats about your photo library"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PeopleNamesChart />
            <GeoPhotosChart />
            <AlbumPhotosChart />
          </div>
        </section>

        {/* ── Storage ── */}
        <section>
          <SectionHeader
            icon={<FolderOpen className="h-4 w-4" />}
            title="Storage"
            description="Disk usage breakdown across users"
          />
          <div className="max-w-md">
            <EXIFDistribution
              column={storageChart.column}
              title={storageChart.title}
              description={storageChart.description}
              tooltipValueFormatter={storageChart.tooltipValueFormatter}
            />
          </div>
        </section>

        {/* ── Camera & Gear ── */}
        <section>
          <SectionHeader
            icon={<Camera className="h-4 w-4" />}
            title="Camera & Gear"
            description="Equipment used across your photo library"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cameraCharts.map((chart) => (
              <EXIFDistribution
                key={chart.column}
                column={chart.column}
                title={chart.title}
                description={chart.description}
                tooltipValueFormatter={chart.tooltipValueFormatter}
              />
            ))}
          </div>
        </section>

        {/* ── Location ── */}
        <section>
          <SectionHeader
            icon={<MapPin className="h-4 w-4" />}
            title="Location"
            description="Where your photos were taken"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {locationCharts.map((chart) => (
              <EXIFDistribution
                key={chart.column}
                column={chart.column}
                title={chart.title}
                description={chart.description}
                tooltipValueFormatter={chart.tooltipValueFormatter}
              />
            ))}
          </div>
        </section>

        {/* ── Technical ── */}
        <section>
          <SectionHeader
            icon={<SlidersHorizontal className="h-4 w-4" />}
            title="Technical"
            description="Camera settings and exposure data"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {technicalCharts.map((chart) => (
              <EXIFDistribution
                key={chart.column}
                column={chart.column}
                title={chart.title}
                description={chart.description}
                tooltipValueFormatter={chart.tooltipValueFormatter}
              />
            ))}
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
