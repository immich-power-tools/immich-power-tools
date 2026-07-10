import {
  IPotentialTrip,
  IPotentialTripsResponse,
  listPotentialTrips,
} from "@/handlers/api/album.handler";
import React, { useEffect, useState } from "react";
import { usePhotoSelectionContext } from "@/contexts/PhotoSelectionContext";
import { useRouter } from "next/router";
import { Loader, MapPin, Plane } from "lucide-react";
import { format, parseISO } from "date-fns";

interface IProps {
  onSelectTrip: (trip: IPotentialTrip) => void;
}

export default function PotentialTrips({ onSelectTrip }: IProps) {
  const router = useRouter();
  const { config } = usePhotoSelectionContext();
  const { startDate: activeStart, endDate: activeEnd } = router.query as {
    startDate?: string;
    endDate?: string;
  };

  const [data, setData] = useState<IPotentialTripsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listPotentialTrips()
      .then(setData)
      .catch((e: any) => setErrorMessage(e?.message ?? "Failed to load trips"))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (trip: IPotentialTrip) => {
    onSelectTrip(trip);
    router.push({
      pathname: router.pathname,
      query: { startDate: trip.startDate, endDate: trip.endDate },
    });
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader className="h-4 w-4 animate-spin" /> Computing trips…
      </div>
    );
  }

  if (errorMessage) {
    return <p className="p-4 text-sm text-destructive">{errorMessage}</p>;
  }

  if (!data || data.trips.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <p className="mb-2">No trips detected.</p>
        <p className="text-xs">
          A trip is ≥{" "}
          <span className="font-mono">
            {data?.home?.city ? "2" : "—"}
          </span>{" "}
          consecutive days of photos taken away from your home location
          {data?.home?.city ? (
            <>
              {" "}
              (currently <span className="font-mono">{data.home.city}</span>)
            </>
          ) : null}
          . If your library has no GPS data, this view will stay empty — use
          the <em>Days</em> tab instead.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y">
      {data.trips.map((t) => {
        const isActive = activeStart === t.startDate && activeEnd === t.endDate;
        return (
          <button
            key={`${t.startDate}-${t.endDate}`}
            type="button"
            onClick={() => handleSelect(t)}
            className={`flex flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
              isActive ? "bg-zinc-100 dark:bg-zinc-900" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <Plane className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">{t.suggestedName}</span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 pl-5">
              <span>
                {format(parseISO(t.startDate), "MMM d")} –{" "}
                {format(parseISO(t.endDate), "MMM d, yyyy")}
              </span>
              <span>·</span>
              <span>{t.assetCount} assets</span>
              <span>·</span>
              <span>{t.dayCount} days</span>
            </div>
            {t.cityName || t.countryName ? (
              <div className="text-xs text-muted-foreground flex items-center gap-1 pl-5">
                <MapPin className="h-3 w-3" />
                {[t.cityName, t.countryName].filter(Boolean).join(", ")}
              </div>
            ) : null}
          </button>
        );
      })}
      {data.home.city ? (
        <div className="px-4 py-2 text-[11px] text-muted-foreground border-t">
          Home: <span className="font-mono">{data.home.city}</span>
          {data.home.lat != null && data.home.lon != null ? (
            <>
              {" "}
              ({data.home.lat.toFixed(2)}, {data.home.lon.toFixed(2)})
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
