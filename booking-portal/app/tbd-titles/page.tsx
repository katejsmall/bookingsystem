import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/data";

export default async function TbdTitlesVotingPage() {
  const { profile } = await requireProfile();
  redirect(profile.role === "team" ? "/crm/tbd-titles" : "/title-requests?tab=survey");
}
