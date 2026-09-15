import { getExhibitors, getUpcomingTitles, requireProfile } from "@/lib/data";
import { titleDisplayName } from "@/lib/display";

export default async function LineupTrailersPage() {
  const { supabase } = await requireProfile();
  const exhibitors = await getExhibitors(supabase); // RLS scopes this to the user's own exhibitor
  const exhibitor = exhibitors[0];

  const formats: string[] = [];
  if (exhibitor?.["4dx"] || exhibitor?.ultra4dx) formats.push("4DX");
  if (exhibitor?.screenx) formats.push("ScreenX");

  // The full confirmed catalogue, not just the Dashboard's ~20 upcoming
  // highlights - getUpcomingTitles already resolves posters and is date-
  // floored, so it doubles as this page's data source with a wider limit.
  const titles = await getUpcomingTitles(supabase, formats, 200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lineup &amp; Trailers</h1>
        <p className="text-sm text-muted mt-1">
          Every confirmed title available in your format(s). Trailer status isn&apos;t tracked yet.
        </p>
      </div>

      {titles.length === 0 ? (
        <p className="text-sm text-muted py-12 text-center">No confirmed titles right now.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Format</th>
                <th className="px-4 py-2.5 font-medium">Release date</th>
                <th className="px-4 py-2.5 font-medium">Trailer</th>
              </tr>
            </thead>
            <tbody>
              {titles.map((t) => (
                <tr key={`${t.lineup_id}`} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL or static placeholder */}
                    <img
                      src={t.posterUrl ?? "/poster-placeholder.svg"}
                      alt=""
                      className="h-9 w-6 rounded-[2px] object-cover shrink-0"
                    />
                    <span className="font-medium">
                      {titleDisplayName(t.title?.film_imdb_db ?? null, t.title?.erp_title, t.title_no)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{t.format}</td>
                  <td className="px-4 py-2.5 text-muted">{t.first_available_release_date ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
