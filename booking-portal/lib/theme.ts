import type { Exhibitor } from "@/lib/types";

export type FormatMix = "4dx" | "screenx" | "both" | "none";

/** Which format family an exhibitor's screens belong to, for branding. */
export function exhibitorFormatMix(
  exh: Pick<Exhibitor, "4dx" | "screenx" | "ultra4dx">
): FormatMix {
  const has4dx = !!exh["4dx"] || !!exh.ultra4dx;
  const hasScreenx = !!exh.screenx;
  if (has4dx && hasScreenx) return "both";
  if (has4dx) return "4dx";
  if (hasScreenx) return "screenx";
  return "none";
}

/** CSS var reference to the gradient matching an exhibitor's format mix -
 * blue for 4DX/Ultra4DX only, red/orange for ScreenX/UltraScreenX only, a
 * blue-to-red blend when they have both. Falls back to the blend for an
 * exhibitor with neither flag set (shouldn't normally happen, but a
 * recognizable brand gradient beats a blank background). */
export function exhibitorGradient(exh: Pick<Exhibitor, "4dx" | "screenx" | "ultra4dx">): string {
  const mix = exhibitorFormatMix(exh);
  if (mix === "4dx") return "var(--gradient-4dx)";
  if (mix === "screenx") return "var(--gradient-screenx)";
  return "var(--gradient-blend)";
}
