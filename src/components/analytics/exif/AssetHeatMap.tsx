import React, { useEffect, useMemo, useState } from "react";
import { getHeatMapData } from "@/handlers/api/analytics.handler";
import { useConfig } from "@/contexts/ConfigContext";
import { Tooltip } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type HeatMapEntry = {
  date: string;
  count: number;
};

const ROLLING = "rolling" as const;

const COLOR_SCALE = [
  "bg-zinc-100 dark:bg-zinc-800/60",
  "bg-emerald-200 dark:bg-emerald-900/70",
  "bg-emerald-300 dark:bg-emerald-800/80",
  "bg-emerald-400 dark:bg-emerald-700",
  "bg-emerald-500 dark:bg-emerald-600",
  "bg-emerald-600 dark:bg-emerald-500",
];

const LEGEND_LABELS = ["None", "", "", "", "", "Max"];

export default function AssetHeatMap() {
  const { exImmichUrl } = useConfig();

  const [heatMapData, setHeatMapData] = useState<HeatMapEntry[][]>([]);
  const [loading, setLoading] = useState(false);
  const [weeksPerMonth, setWeeksPerMonth] = useState<number[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selection, setSelection] = useState<typeof ROLLING | number>(ROLLING);

  const fetchHeatMapData = async (sel: typeof ROLLING | number) => {
    setLoading(true);
    try {
      const resp = await getHeatMapData(sel === ROLLING ? undefined : sel);
      setAvailableYears(resp.availableYears ?? []);
      setHeatMapData(formatHeatMapData(resp.data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeatMapData(selection);
  }, [selection]);

  const months = useMemo(() => {
    if (selection === ROLLING) {
      const cursor = new Date();
      const out: string[] = [];
      for (let i = 0; i < 12; i++) {
        out.push(cursor.toLocaleString("default", { month: "short" }));
        cursor.setMonth(cursor.getMonth() - 1);
      }
      return out.reverse();
    }
    // Calendar year: Jan-Dec in order.
    return Array.from({ length: 12 }, (_, i) =>
      new Date(selection, i, 1).toLocaleString("default", { month: "short" })
    );
  }, [selection]);

  const flattenedData = heatMapData.flat();
  const minCount = Math.min(...flattenedData.map((entry) => entry.count));
  const maxCount = Math.max(...flattenedData.map((entry) => entry.count));

  const hasFirstDayOfMonth = (arr: HeatMapEntry[]) => {
    return arr.some((entry) => new Date(entry.date).getDate() === 1);
  };

  const getColor = (count: number) => {
    if (count === -1) return "";
    if (count === 0) return COLOR_SCALE[0];

    const range = maxCount - minCount;
    const threshold1 = minCount + range * 0.2;
    const threshold2 = minCount + range * 0.4;
    const threshold3 = minCount + range * 0.6;
    const threshold4 = minCount + range * 0.8;

    if (count <= threshold1) return COLOR_SCALE[1];
    if (count <= threshold2) return COLOR_SCALE[2];
    if (count <= threshold3) return COLOR_SCALE[3];
    if (count <= threshold4) return COLOR_SCALE[4];
    return COLOR_SCALE[5];
  };

  const formatHeatMapData = (data: HeatMapEntry[]) => {
    const chunks = [];
    const weeksPerMonthTemp: number[] = [];
    let previousMonthIndex = 0;

    for (let i = 0; i < data.length; i += 7) {
      const thisWeek = data.slice(i, i + 7);
      chunks.push(thisWeek);

      if (hasFirstDayOfMonth(thisWeek)) {
        const changeWeek = (i - previousMonthIndex) / 7;
        previousMonthIndex = i;
        weeksPerMonthTemp.push(changeWeek);
      }
    }
    weeksPerMonthTemp.reverse();
    setWeeksPerMonth(weeksPerMonthTemp);
    return chunks;
  };

  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-end mb-2">
        <Select
          value={selection === ROLLING ? ROLLING : String(selection)}
          onValueChange={(v) => setSelection(v === ROLLING ? ROLLING : Number(v))}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ROLLING}>Last 12 months</SelectItem>
            {availableYears.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="table-auto border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th className="w-8" />
              {weeksPerMonth.map((weeks, index) => (
                <th
                  key={index}
                  className="text-xs font-medium text-muted-foreground pb-1"
                  colSpan={weeks || 4}
                >
                  {months[index]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatMapData[0]?.map((_, rowIndex) => (
              <tr key={rowIndex}>
                <td className="text-[10px] text-muted-foreground pr-2 text-right w-8 select-none">
                  {dayLabels[rowIndex]}
                </td>
                {heatMapData.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className={`h-[14px] w-[14px] ${getColor(column[rowIndex]?.count ?? -1)} rounded-sm transition-colors`}
                  >
                    {column[rowIndex]?.date ? (
                      <Tooltip
                        delayDuration={0}
                        content={`${column[rowIndex]?.count ?? 0} photos on ${column[rowIndex]?.date}`}
                      >
                        <a
                          href={`${exImmichUrl}/search?query=%7B%22takenAfter%22%3A%22${column[rowIndex]?.date ?? "N/A"}T00%3A00%3A00.000Z%22%2C%22takenBefore%22%3A%22${column[rowIndex]?.date ?? "N/A"}T23%3A59%3A59.999Z%22%7D`}
                          className="block h-[14px] w-[14px] rounded-sm hover:ring-2 hover:ring-foreground/20 transition-shadow"
                          target="_blank"
                        >
                          <div className="h-[14px] w-[14px]" />
                        </a>
                      </Tooltip>
                    ) : (
                      <div className="h-[14px] w-[14px]" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-muted-foreground select-none">
        <span>Less</span>
        {COLOR_SCALE.map((color, i) => (
          <div
            key={i}
            className={`h-[12px] w-[12px] rounded-sm ${color}`}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
