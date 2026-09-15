import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/data";

export default async function Home() {
  const { profile } = await requireProfile();
  redirect(profile.role === "team" ? "/home" : "/dashboard");
}
