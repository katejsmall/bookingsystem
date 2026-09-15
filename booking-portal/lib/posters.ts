/** The three artwork slots a title can carry. */
export const POSTER_SLOTS = ["base", "4dx", "screenx"] as const;
export type PosterSlot = (typeof POSTER_SLOTS)[number];

export const POSTER_SLOT_LABELS: Record<PosterSlot, string> = {
  base: "Base poster",
  "4dx": "4DX artwork",
  screenx: "ScreenX artwork",
};

/** Column on film_imdb_db backing each slot. */
export const POSTER_SLOT_COLUMNS: Record<PosterSlot, string> = {
  base: "poster_path",
  "4dx": "poster_path_4dx",
  screenx: "poster_path_screenx",
};

export type PosterPaths = {
  poster_path: string | null;
  poster_path_4dx: string | null;
  poster_path_screenx: string | null;
};

/**
 * A stored poster reference is one of two things:
 *  - a path inside the private IMAGES bucket ("Posters/Foo.jpg"), used for
 *    the exclusive 4DX/ScreenX artwork the distributors send us, or
 *  - an absolute URL on TMDB's CDN, used for the base posters backfilled
 *    from the titles' IMDb IDs.
 * Bucket paths need a signed URL; external ones are served as-is.
 */
export function isExternalPoster(path: string | null | undefined): boolean {
  return !!path && /^https?:\/\//i.test(path);
}

/** TMDB size slugs, smallest first. w185 is plenty for a calendar pill. */
export type PosterSize = "w92" | "w185" | "w342" | "w500" | "original";

/**
 * Re-sizes a TMDB URL by swapping its size segment, so one stored value
 * serves a 15KB calendar thumbnail and a crisp dashboard card. Anything
 * that isn't a TMDB URL is returned untouched.
 */
export function posterUrlForSize(url: string, size: PosterSize): string {
  return url.replace(
    /(https?:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/)/i,
    `$1${size}$3`
  );
}

/**
 * The artwork to show for a title in a given format context: the
 * format-specific file when one exists, otherwise the base poster.
 * Ultra4DX/UltraScreenX are combo screens, so they use their base
 * format's artwork.
 */
export function resolvePosterPath(
  paths: Partial<PosterPaths> | null | undefined,
  format?: string | null
): string | null {
  if (!paths) return null;
  const base = format?.replace(/^Ultra/, "");
  if (base === "4DX" && paths.poster_path_4dx) return paths.poster_path_4dx;
  if (base === "ScreenX" && paths.poster_path_screenx) return paths.poster_path_screenx;
  return paths.poster_path ?? null;
}

/** Every non-null artwork path on a row, for batch signing. */
export function allPosterPaths(paths: Partial<PosterPaths> | null | undefined): string[] {
  if (!paths) return [];
  return [paths.poster_path, paths.poster_path_4dx, paths.poster_path_screenx].filter(
    (p): p is string => !!p
  );
}

/**
 * Turns a stored reference into something an <img src> can use, given a
 * map of already-signed bucket URLs. Keeps the "bucket vs external"
 * decision in one place so callers don't each re-implement it.
 */
export function posterSrc(
  path: string | null | undefined,
  signed: Record<string, string>,
  size: PosterSize = "w342"
): string | null {
  if (!path) return null;
  if (isExternalPoster(path)) return posterUrlForSize(path, size);
  return signed[path] ?? null;
}
