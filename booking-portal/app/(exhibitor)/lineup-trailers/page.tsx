import { TrailerCatalogue } from "@/components/exhibitor/TrailerCatalogue";
import { getExhibitors, getMyTrailerRequests, getTrailerAssets, requireProfile } from "@/lib/data";

export default async function LineupTrailersPage() {
  const { supabase } = await requireProfile();
  const exhibitors = await getExhibitors(supabase); // RLS scopes this to the user's own exhibitor
  const exhibitor = exhibitors[0];

  const formats: string[] = [];
  if (exhibitor?.["4dx"] || exhibitor?.ultra4dx) formats.push("4DX");
  if (exhibitor?.screenx) formats.push("ScreenX");

  const [assets, myRequests] = await Promise.all([
    getTrailerAssets(supabase, { formats, hasUltra: !!exhibitor?.ultra4dx }),
    getMyTrailerRequests(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lineup &amp; Trailers</h1>
        <p className="text-sm text-muted mt-1">
          Trailer, brand, and QC assets available for your format(s). Request any of them and the
          CJ team will get it to you.
        </p>
      </div>

      <TrailerCatalogue assets={assets} myRequests={myRequests} />
    </div>
  );
}
