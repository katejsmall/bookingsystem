export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <h1 className="text-xl font-semibold tracking-tight mb-2">{title}</h1>
      <p className="text-sm text-muted max-w-sm">
        This section is coming soon. Reach out to the CJ 4DPLEX team if there&apos;s something you
        need here sooner.
      </p>
    </div>
  );
}
