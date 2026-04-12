import { describe, it, expect } from "vitest";
import { profileColor, EXCLUDED_HUE_RANGE } from "./profileColor";

/** Parse an hsl() string into its three numeric components. */
function parseHsl(s: string): { h: number; s: number; l: number } {
  const match = s.match(
    /hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/,
  );
  if (!match) throw new Error(`bad hsl: ${s}`);
  return {
    h: Number(match[1]),
    s: Number(match[2]) / 100,
    l: Number(match[3]) / 100,
  };
}

function linearize(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminanceHex(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function luminanceHsl(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return (
    0.2126 * linearize(r + m) +
    0.7152 * linearize(g + m) +
    0.0722 * linearize(b + m)
  );
}

function contrast(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("profileColor", () => {
  it("is deterministic: same input → same output", () => {
    for (const name of ["dev", "prod", "staging", "qa", "test", "default"]) {
      const a = profileColor(name);
      const b = profileColor(name);
      expect(a).toEqual(b);
    }
  });

  it("distinguishes common profile names (not all the same color)", () => {
    const names = ["dev", "prod", "staging", "qa", "test", "default"];
    const unique = new Set(names.map((n) => profileColor(n).bg));
    // Expect at least 4 distinct hues across 6 common names.
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });

  it("excludes the orange hue range to avoid DEMO badge clash", () => {
    const [lo, hi] = EXCLUDED_HUE_RANGE;
    // Generate colors for 500 profile names and assert no hue lands in the
    // forbidden range.
    for (let i = 0; i < 500; i++) {
      const name = `profile-${i}-${(Math.random() * 1e9).toString(36)}`;
      const { h } = parseHsl(profileColor(name).bg);
      expect(h >= lo && h < hi).toBe(false);
    }
  });

  it("picks fg colour that meets WCAG AA contrast (4.5:1) for common names", () => {
    const names = [
      "dev",
      "prod",
      "staging",
      "qa",
      "test",
      "default",
      "ci",
      "prod-us-east-1",
      "dev-eu-west-1",
      "shared-services",
    ];
    for (const name of names) {
      const { bg, fg } = profileColor(name);
      const { h, s, l } = parseHsl(bg);
      const lumBg = luminanceHsl(h, s, l);
      const lumFg = luminanceHex(fg);
      expect(contrast(lumBg, lumFg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("handles edge-case names without throwing", () => {
    for (const name of ["", "x", "a".repeat(64), "ñoño", "💥"]) {
      expect(() => profileColor(name)).not.toThrow();
    }
  });
});
