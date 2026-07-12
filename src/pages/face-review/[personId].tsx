import React from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/router";

import { CandidateClustersView, OwnClustersView } from "@/components/face-review/ClusterViews";
import FindMoreFacesView from "@/components/face-review/FindMoreFacesView";
import { IPrimaryTab, ISubTab } from "@/components/face-review/ReviewTabs";
import TaggedFacesView from "@/components/face-review/TaggedFacesView";
import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import Loader from "@/components/ui/loader";
import { PERSON_THUBNAIL_PATH } from "@/config/routes";
import { getFaceReviewPersonInfo } from "@/handlers/api/faceReview.handler";
import { IFaceReviewScope } from "@/types/faceReview";

/**
 * Face Review page: 2 primary tabs (which face set) x 2 sub-tabs (which lens
 * on it) — Tagged faces = this person's own detections; Find more =
 * candidates near their centroid that aren't them yet. Faces = flat ranked
 * list; Clusters = mutual-similarity groups.
 */
export default function FaceReviewPersonPage() {
  const router = useRouter();
  const { personId } = router.query as { personId: string };
  const tab = (router.query.tab as IPrimaryTab) || "tagged";
  const sub = (router.query.sub as ISubTab) || "faces";
  const scope: IFaceReviewScope = router.query.scope === "named" ? "named" : "unnamed";
  // Which list filter the user came from on the index page, so a whole-
  // person merge can send them back to it instead of the default filter.
  const returnFilter = typeof router.query.returnFilter === "string" ? router.query.returnFilter : undefined;

  const info = useQuery({
    queryKey: ["face-review", "info", personId],
    queryFn: () => getFaceReviewPersonInfo(personId),
    enabled: !!personId,
  });

  const setParams = (params: Record<string, string>) => {
    router.push(
      { pathname: router.pathname, query: { ...router.query, ...params } },
      undefined,
      { shallow: true }
    );
  };

  if (!personId || info.isLoading) return <Loader />;
  if (info.isError) {
    return (
      <PageLayout title="Face Review">
        <div className="p-8 text-center text-destructive">
          {String((info.error as any)?.error || "Person not found")}
        </div>
      </PageLayout>
    );
  }
  const person = info.data;

  return (
    <PageLayout className="!p-4" title={`Review: ${person?.name || "(unnamed)"}`}>
      <Header
        leftComponent={
          <div className="flex items-center gap-2">
            <Image
              src={PERSON_THUBNAIL_PATH(personId)}
              alt={person?.name || "person"}
              width={32}
              height={32}
              className="rounded-full"
              unoptimized
            />
            <span className="font-medium">Reviewing: {person?.name || "(unnamed)"}</span>
            <span className="text-sm text-muted-foreground">
              {person?.faceCount?.toLocaleString?.() ?? person?.faceCount} faces
            </span>
          </div>
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-8">
        {/* Each view renders the tab bar (via <ReviewTabs/>) inline with its
            own controls, so the whole header sits on one row. */}
        {tab === "tagged" && sub === "faces" && (
          <TaggedFacesView
            personId={personId}
            personName={person?.name || ""}
            tab={tab} sub={sub} scope={scope} setParams={setParams}
            returnFilter={returnFilter}
          />
        )}
        {tab === "tagged" && sub === "clusters" && (
          <OwnClustersView
            personId={personId}
            tab={tab} sub={sub} scope={scope} setParams={setParams}
          />
        )}
        {tab === "find-more" && sub === "faces" && (
          <FindMoreFacesView
            personId={personId}
            personName={person?.name || ""}
            tab={tab} sub={sub} scope={scope} setParams={setParams}
          />
        )}
        {tab === "find-more" && sub === "clusters" && (
          <CandidateClustersView
            personId={personId}
            personName={person?.name || ""}
            tab={tab} sub={sub} scope={scope} setParams={setParams}
          />
        )}
      </div>
    </PageLayout>
  );
}
