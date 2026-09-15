/**
 * Small poster thumbnail with a consistent placeholder, so a title without
 * artwork still occupies the same space and rows stay aligned.
 * Sources are either a signed IMAGES-bucket URL or a TMDB CDN URL.
 */
export function PosterThumb({
  src,
  alt,
  className = "h-11 w-[30px]",
}: {
  src: string | null;
  alt?: string;
  className?: string;
}) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed/CDN URL, not Next-optimizable
    <img
      src={src}
      alt={alt ?? ""}
      loading="lazy"
      className={`${className} shrink-0 rounded-[3px] border border-line object-cover`}
    />
  ) : (
    <span
      className={`${className} shrink-0 rounded-[3px] border border-line bg-plane`}
      aria-hidden="true"
    />
  );
}
