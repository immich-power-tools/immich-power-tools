import React from "react";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IFaceReviewScope } from "@/types/faceReview";

export type IPrimaryTab = "tagged" | "find-more";
export type ISubTab = "faces" | "clusters";

/** Tab-bar wiring every review view threads through to <ReviewTabs/>. */
export interface IReviewNavProps {
  tab: IPrimaryTab;
  sub: ISubTab;
  scope: IFaceReviewScope;
  setParams: (params: Record<string, string>) => void;
}

/**
 * The Face Review tab bar, rendered as bare flex children (a fragment) so each
 * view can drop it into the SAME flex-wrap row as its own controls — the whole
 * header (primary tab + sub-tab + view controls) then lives on one line
 * instead of stacking. "Include" only makes sense while browsing Find More, so
 * it hides inside an open cluster (showInclude=false).
 */
export default function ReviewTabs({
  tab,
  sub,
  scope,
  setParams,
  showInclude = tab === "find-more",
}: {
  tab: IPrimaryTab;
  sub: ISubTab;
  scope: IFaceReviewScope;
  setParams: (params: Record<string, string>) => void;
  showInclude?: boolean;
}) {
  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v, sub: "faces" })}>
        <TabsList>
          {/* "Tagged" (not "Tagged faces") — the section covers both the Faces
              and Clusters sub-tabs, so "faces" here was misleading. */}
          <TabsTrigger value="tagged">Tagged</TabsTrigger>
          <TabsTrigger value="find-more">Find more</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={sub} onValueChange={(v) => setParams({ sub: v })}>
        <TabsList>
          <TabsTrigger value="faces">Faces</TabsTrigger>
          <TabsTrigger value="clusters">Clusters</TabsTrigger>
        </TabsList>
      </Tabs>
      {showInclude && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Include</label>
          <Select value={scope} onValueChange={(v) => setParams({ scope: v })}>
            <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unnamed">Unnamed faces only</SelectItem>
              <SelectItem value="named">Already-named faces</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}
