import { ContactAdmin } from "@/components/crm/ContactAdmin";
import { ExhibitorAdmin } from "@/components/crm/ExhibitorAdmin";
import { PageHead, SectionHead } from "@/components/team/PageHead";
import { titleDisplayName } from "@/lib/display";
import { getContacts, getScreens, getTitleMaster, signedImageUrls } from "@/lib/data";
import { getTeamContext } from "@/lib/teamContext";
import { scopeByExhibitorIds, scopeSuffix } from "@/lib/teamScope";

export default async function ExhibitorsPage() {
  const { supabase, scope, isAll, exhibitors, exhibitorIds } = await getTeamContext();

  const [allContacts, allScreens, titles] = await Promise.all([
    getContacts(supabase),
    getScreens(supabase),
    getTitleMaster(supabase),
  ]);

  const logoPaths = exhibitors.map((e) => e.logo_path).filter((p): p is string => !!p);
  const logoUrls = await signedImageUrls(supabase, [...new Set(logoPaths)]);

  const contacts = isAll
    ? allContacts
    : allContacts.filter((c) => !!c.exhibitor_unique && exhibitorIds.has(c.exhibitor_unique));
  const screens = isAll
    ? allScreens
    : scopeByExhibitorIds(allScreens, exhibitorIds, (s) => s.exhibitor_id);

  const exhibitorOpts = exhibitors.map((e) => ({
    exhibitor_unique: e.exhibitor_unique,
    name: e.exhibitor_erp ?? e.exhibitor_unique,
  }));

  return (
    <div className="space-y-9">
      <div>
        <PageHead
          title="Exhibitors"
          subtitle={`${exhibitors.length} exhibitor${exhibitors.length === 1 ? "" : "s"} ${scopeSuffix(scope)}.`}
        />
        <ExhibitorAdmin exhibitors={exhibitors} logoUrls={logoUrls} />
      </div>

      {/* Contacts belong to exhibitors, so they live on the same record
          rather than in their own top-level menu item. */}
      <section>
        <SectionHead title={`Contacts (${contacts.length})`} />
        <ContactAdmin
          contacts={contacts}
          exhibitors={exhibitorOpts}
          screens={screens.map((s) => ({
            screenUnique: s.screen_unique,
            exhibitorId: s.exhibitor_id,
            label: [s.site_name, s.screen_name].filter(Boolean).join(" · ") || s.screen_unique,
          }))}
          titles={titles.map((t) => ({
            titleNo: t.title_no,
            name: titleDisplayName(t.film_imdb_db, t.erp_title, t.title_no),
          }))}
        />
      </section>
    </div>
  );
}
