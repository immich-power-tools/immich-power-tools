import { IPersonListFilters, listPeople } from "@/handlers/api/people.handler";
import { IPerson } from "@/types/person";
import React, { useEffect, useState } from "react";
import Loader from "../ui/loader";
import PersonItem from "./PersonItem";
import { PeopleFilters } from "./PeopleFilters";
import { useRouter } from "next/router";
import PeopleFilterContext from "@/contexts/PeopleFilterContext";
import PageLayout from "../layouts/PageLayout";
import Header from "../shared/Header";
import { Users } from "lucide-react";

const COLS_KEY = "people_grid_cols";

function getStoredCols(): number {
  if (typeof window === "undefined") return 6;
  const v = parseInt(localStorage.getItem(COLS_KEY) || "", 10);
  return isNaN(v) ? 6 : Math.min(20, Math.max(3, v));
}

export default function PeopleList() {
  const router = useRouter();
  const [people, setPeople] = useState<IPerson[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cols, setCols] = useState<number>(6);
  const [filters, setFilters] = useState<IPersonListFilters>({
    // Hidden people are hidden for a reason — don't surface them until asked.
    // Listed before router.query so a ?visibility= in the URL still wins.
    visibility: "visible",
    ...router.query,
    page: 1,
  });

  // Hydrate cols from localStorage after mount
  useEffect(() => {
    setCols(getStoredCols());
  }, []);

  const handleColsChange = (val: number) => {
    setCols(val);
    localStorage.setItem(COLS_KEY, String(val));
  };

  const fetchData = async () => {
    setLoading(true);
    setErrorMessage(null);
    return listPeople(filters)
      .then((response) => {
        setPeople(response.people);
        setCount(response.total);
      })
      .catch((error) => {
        setErrorMessage(error.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleRemove = (person: IPerson) => {
    setPeople((prev) => prev.filter((p) => p.id !== person.id));
  };

  useEffect(() => {
    if (!router.isReady) return;
    fetchData();
  }, [filters]);

  const renderContent = () => {
    if (loading) return <Loader />;
    if (errorMessage) return <div className="p-4 text-sm text-destructive">{errorMessage}</div>;
    if (!people.length) return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Users className="h-10 w-10 opacity-30" />
        <p className="text-sm">No people found</p>
      </div>
    );

    return (
      <div
        className="grid gap-2 p-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {people.map((person) => (
          <PersonItem person={person} key={person.id} onRemove={handleRemove} />
        ))}
      </div>
    );
  };

  return (
    <PeopleFilterContext.Provider
      value={{
        ...filters,
        updateContext: (newConfig) =>
          setFilters((prev) => ({ ...prev, ...newConfig })),
      }}
    >
      <PageLayout className="!p-0 !mb-0 relative">
        <Header
          leftComponent="Manage People"
          rightComponent={<PeopleFilters />}
        />
        {renderContent()}

        {/* Grid size slider — fixed bottom-left */}
        <div className="fixed bottom-4 left-[210px] lg:left-[250px] z-20 flex items-center gap-3 bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 shadow-md">
          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="range"
            min={3}
            max={20}
            step={1}
            value={cols}
            onChange={(e) => handleColsChange(Number(e.target.value))}
            className="w-28 h-1.5 appearance-none rounded-full bg-muted cursor-pointer accent-foreground"
            title={`${cols} per row`}
          />
          <span className="text-xs font-mono text-muted-foreground w-4 text-center">{cols}</span>
        </div>
      </PageLayout>
    </PeopleFilterContext.Provider>
  );
}
