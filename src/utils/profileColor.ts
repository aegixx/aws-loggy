/**
 * Deterministic color assignment for AWS profile names.
 *
 * Given a profile name, produces a stable `{ bg, fg }` pair where the
 * background comes from a hash-derived HSL and the foreground is black or
 * white, chosen for WCAG AA contrast (≥ 4.5:1) against that background.
 *
 * Orange (hue 20°–40°) is excluded because the StatusBar DEMO badge already
 * uses an orange tint and we want profile badges to be visually distinct
 * from it.
 */

export interface ProfileColor {
  bg: string;
  fg: string;
}

/** djb2 string hash. Small, stable, no deps. */
function hashString(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i);
  }
  // Force unsigned 32-bit.
  return hash >>> 0;
}

/**
 * Pick an HSL hue from the hash, avoiding the orange range [20°, 40°].
 * We wrap around by mapping the hash to a 340° interval and then shifting
 * past the forbidden zone if the result lands inside it.
 */
function pickHue(hash: number): number {
  // 320° usable range after removing 20° + 20° buffer on each side of orange.
  const usable = 320;
  const raw = hash % usable; // 0..319
  // Map to [0, 20) ∪ [40, 360) by shifting anything in [20, 320) up by 20.
  return raw < 20 ? raw : raw + 20;
}

/**
 * Relative luminance per WCAG 2.1.
 * Input: 0-1 linear RGB channels.
 */
function luminanceFromRgb(r: number, g: number, b: number): number {
  const linearize = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Convert HSL (h: 0-360, s: 0-1, l: 0-1) to linear RGB (0-1). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hPrime < 1) {
    [r1, g1, b1] = [c, x, 0];
  } else if (hPrime < 2) {
    [r1, g1, b1] = [x, c, 0];
  } else if (hPrime < 3) {
    [r1, g1, b1] = [0, c, x];
  } else if (hPrime < 4) {
    [r1, g1, b1] = [0, x, c];
  } else if (hPrime < 5) {
    [r1, g1, b1] = [x, 0, c];
  } else {
    [r1, g1, b1] = [c, 0, x];
  }
  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

/**
 * WCAG contrast ratio between two relative luminances (0-1).
 * Returns a value in [1, 21].
 */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Return the profile badge color pair for the given profile name. Same input
 * always yields the same output.
 *
 * The background uses a fixed saturation/lightness (65%/45%) that lands in a
 * reasonable mid-range for hue variety. The foreground is white or black,
 * whichever beats 4.5:1 contrast; we prefer white because it matches the
 * StatusBar text color elsewhere.
 */
export function profileColor(name: string): ProfileColor {
  const hash = hashString(name);
  const hue = pickHue(hash);
  const saturation = 0.65;
  const lightness = 0.45;

  const bg = `hsl(${hue}, ${Math.round(saturation * 100)}%, ${Math.round(
    lightness * 100,
  )}%)`;

  const [r, g, b] = hslToRgb(hue, saturation, lightness);
  const lum = luminanceFromRgb(r, g, b);

  const whiteContrast = contrastRatio(lum, 1);
  const blackContrast = contrastRatio(lum, 0);

  // Prefer white unless black gives meaningfully better contrast.
  const fg =
    whiteContrast >= 4.5 || whiteContrast >= blackContrast
      ? "#ffffff"
      : "#000000";

  return { bg, fg };
}

/**
 * Explicit orange-exclusion range for tests.
 * @internal
 */
export const EXCLUDED_HUE_RANGE: readonly [number, number] = [20, 40];
