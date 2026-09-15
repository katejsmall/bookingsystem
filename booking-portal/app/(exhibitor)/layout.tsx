import { redirect } from "next/navigation";
import { ExhibitorShell } from "@/components/exhibitor/ExhibitorShell";
import { getExhibitors, requireProfile } from "@/lib/data";
import { exhibitorFormatMix, exhibitorGradient } from "@/lib/theme";

export default async function ExhibitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user, profile } = await requireProfile();
  // The new sidebar shell is exhibitor-only; team users keep the existing
  // top-nav AppShell everywhere else.
  if (profile.role === "team") redirect("/calendar");

  const exhibitors = await getExhibitors(supabase); // RLS scopes this to the user's own exhibitor
  const exhibitor = exhibitors[0];
  const exhibitorName = exhibitor?.exhibitor_erp ?? exhibitor?.exhibitor_unique ?? "Exhibitor";
  const formatMix = exhibitor ? exhibitorFormatMix(exhibitor) : "both";
  const gradient = exhibitor ? exhibitorGradient(exhibitor) : "var(--gradient-blend)";

  return (
    <ExhibitorShell
      exhibitorName={exhibitorName}
      email={user.email}
      gradient={gradient}
      formatMix={formatMix}
    >
      {children}
    </ExhibitorShell>
  );
}
