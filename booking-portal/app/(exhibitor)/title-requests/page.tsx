import { Suspense } from "react";
import { TitleRequestsView } from "@/components/exhibitor/TitleRequestsView";
import { getMyTbdVotes, getProductionRequests, getTbdTitles, requireProfile } from "@/lib/data";

export default async function TitleRequestsPage() {
  const { supabase } = await requireProfile();

  const [productionRequests, tbdTitles, myTbdVotes] = await Promise.all([
    getProductionRequests(supabase),
    getTbdTitles(supabase),
    getMyTbdVotes(supabase),
  ]);

  return (
    <Suspense>
      <TitleRequestsView
        productionRequests={productionRequests}
        tbdTitles={tbdTitles}
        myTbdVotes={myTbdVotes}
      />
    </Suspense>
  );
}
