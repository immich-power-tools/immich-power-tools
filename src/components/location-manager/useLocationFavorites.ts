import { toast } from "@/components/ui/use-toast";
import {
  createLocationFavorite,
  deleteLocationFavorite,
  ILocationFavorite,
  listLocationFavorites,
  reorderLocationFavorites,
  updateLocationFavorite,
} from "@/handlers/api/locationFavorite.handler";
import { ILatLng } from "@/lib/location-manager/coordinates";
import { useEffect, useState } from "react";

// Single source of truth for the user's favourites — shared between the
// management sheet and the floating bar's quick-apply dropdown.
export function useLocationFavorites() {
  const [favorites, setFavorites] = useState<ILocationFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listLocationFavorites()
      .then(setFavorites)
      .catch(() =>
        toast({
          title: "Error",
          description: "Failed to load favourites",
          variant: "destructive",
        })
      )
      .finally(() => setLoading(false));
  }, []);

  const add = async (name: string, coords: ILatLng): Promise<boolean> => {
    setBusy(true);
    try {
      const created = await createLocationFavorite({
        name,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      setFavorites((prev) => [...prev, created]);
      toast({ title: `Favourite "${created.name}" added` });
      return true;
    } catch {
      toast({
        title: "Error",
        description: "Failed to add favourite",
        variant: "destructive",
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string, name: string): Promise<boolean> => {
    setBusy(true);
    try {
      const updated = await updateLocationFavorite(id, { name });
      setFavorites((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      return true;
    } catch {
      toast({
        title: "Error",
        description: "Failed to rename favourite",
        variant: "destructive",
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (favorite: ILocationFavorite) => {
    try {
      await deleteLocationFavorite(favorite.id);
      setFavorites((prev) => prev.filter((f) => f.id !== favorite.id));
      toast({ title: `Favourite "${favorite.name}" deleted` });
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete favourite",
        variant: "destructive",
      });
    }
  };

  // Optimistic: reorder locally right away, persist in the background,
  // reload from the server if persisting fails.
  const reorder = (orderedIds: string[]) => {
    setFavorites((prev) => {
      const byId = new Map(prev.map((f) => [f.id, f]));
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((f): f is ILocationFavorite => !!f);
      return next.length === prev.length ? next : prev;
    });
    reorderLocationFavorites(orderedIds).catch(() => {
      toast({
        title: "Error",
        description: "Failed to save the new order",
        variant: "destructive",
      });
      listLocationFavorites().then(setFavorites).catch(() => {});
    });
  };

  return { favorites, loading, busy, add, rename, remove, reorder };
}
