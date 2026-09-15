import { PageHead } from "@/components/team/PageHead";

export default function ContractsPage() {
  return (
    <>
      <PageHead
        title="Contracts"
        subtitle="Exhibitor agreements, amendments and content revenue-share contracts."
      />
      <div className="rounded-[14px] border border-line bg-plane px-[18px] py-16 text-center">
        <p className="text-sm font-medium">Not set up yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs text-muted">
          This is where exhibitor contracts, amendments and content revenue-share agreements will
          live. Tell the team what you need to store against each contract — dates, parties, rev-share
          terms, signed PDFs — and it can be built out.
        </p>
      </div>
    </>
  );
}
