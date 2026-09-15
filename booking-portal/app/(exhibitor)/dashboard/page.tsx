import { DashboardView } from "@/components/exhibitor/DashboardView";
import { getDashboardTitles, getExhibitors, requireProfile } from "@/lib/data";

export default async function DashboardPage() {
  const { supabase } = await requireProfile();
  const exhibitors = await getExhibitors(supabase); // RLS scopes this to the user's own exhibitor
  const exhibitor = exhibitors[0];

  // lineup.format only ever holds "4DX"/"ScreenX" (Ultra4DX/UltraScreenX
  // screens book against those base-format lineup rows, see
  // 20260723130000_normalize_ultra_format_trigger.sql) - so the dashboard's
  // filter only ever needs these two, with ultra4dx folded into the 4DX family.
  const formats: string[] = [];
  if (exhibitor?.["4dx"] || exhibitor?.ultra4dx) formats.push("4DX");
  if (exhibitor?.screenx) formats.push("ScreenX");

  const titles = await getDashboardTitles(supabase, formats);
  const exhibitorName = exhibitor?.exhibitor_erp ?? exhibitor?.exhibitor_unique ?? "Exhibitor";

  return <DashboardView exhibitorName={exhibitorName} titles={titles} formats={formats} />;
}
