"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { MyProductionRequests } from "@/components/MyProductionRequests";
import { ProductionRequestForm } from "@/components/ProductionRequestForm";
import { TbdVoteForm } from "@/components/TbdVoteForm";
import type { ProductionRequestVM, TbdTitle, TbdVote } from "@/lib/types";

const SECTIONS = [
  { key: "requests", label: "Recommend a Title" },
  { key: "survey", label: "Demand Survey" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

export function TitleRequestsView({
  productionRequests,
  tbdTitles,
  myTbdVotes,
}: {
  productionRequests: ProductionRequestVM[];
  tbdTitles: TbdTitle[];
  myTbdVotes: Record<number, TbdVote>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const sectionParam = searchParams.get("tab");
  const active: SectionKey = SECTIONS.some((s) => s.key === sectionParam)
    ? (sectionParam as SectionKey)
    : "requests";

  const setSection = (key: SectionKey) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", key);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Title Requests</h1>
        <p className="text-sm text-muted mt-1">
          Recommend titles for production, and tell us if you&apos;d book the ones we&apos;re
          weighing up.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-line">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              active === s.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {active === "requests" && (
        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <section>
            <ProductionRequestForm />
          </section>
          <section>
            <MyProductionRequests requests={productionRequests} />
          </section>
        </div>
      )}

      {active === "survey" && <TbdVoteForm titles={tbdTitles} myVotes={myTbdVotes} />}
    </div>
  );
}
