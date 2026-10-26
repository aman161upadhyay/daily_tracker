/**
 * Minimal sRGB ⇄ OKLCH conversion (Björn Ottosson's OKLab) used to blend the
 * adherence scale without the muddy middles RGB interpolation produces.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number; // degrees
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => {
    const c = Math.max(0, Math.min(255, Math.round(v)));
    return c < 16 ? `0${c.toString(16)}` : c.toString(16);
  };
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** "#RRGGBB" + alpha → "rgba(r, g, b, a)" */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an "#RRGGBB" colour. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio between two opaque colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * A fill close to `hex` on which `ink` reaches `minRatio` (4.5 = WCAG AA for small text): the
 * lightness moves away from the ink in OKLCH, hue and chroma kept, until the contrast is there.
 * Mid-tone category colours (a teal, an olive) reach neither 4.5 with white nor with near-black
 * as they are; a solid disc with a number on it needs this.
 */
export function readableFill(hex: string, ink: string, minRatio = 4.5): string {
  if (contrastRatio(hex, ink) >= minRatio) return hex;
  const base = hexToOklch(hex);
  const direction = luminance(ink) > 0.5 ? -1 : 1;
  for (let step = 1; step <= 30; step++) {
    const l = Math.max(0, Math.min(1, base.l + direction * step * 0.02));
    const candidate = oklchToHex({ ...base, l });
    if (contrastRatio(candidate, ink) >= minRatio) return candidate;
  }
  return direction < 0 ? '#000000' : '#FFFFFF';
}

/** The ink out of `inks` that reads best on an opaque `background` (the first one wins a tie). */
export function inkFor(background: string, inks: readonly string[]): string {
  let best = inks[0];
  let bestRatio = -1;
  for (const ink of inks) {
    const ratio = contrastRatio(background, ink);
    if (ratio > bestRatio) {
      best = ink;
      bestRatio = ratio;
    }
  }
  return best;
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(1, c)) * 255;
}

export function hexToOklch(hex: string): Oklch {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = srgbToLinear(r8);
  const g = srgbToLinear(g8);
  const b = srgbToLinear(b8);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);

  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.291485548 * B;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const b = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  return rgbToHex(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b));
}

/** Blend two hex colors in OKLCH; `t` in [0, 1]. Hue takes the shortest arc. */
export function mixOklch(fromHex: string, toHex: string, t: number): string {
  const a = hexToOklch(fromHex);
  const b = hexToOklch(toHex);
  const k = Math.max(0, Math.min(1, t));

  // Achromatic endpoints borrow the other side's hue to avoid hue spinning.
  const ha = a.c < 1e-4 ? b.h : a.h;
  const hb = b.c < 1e-4 ? a.h : b.h;
  let dh = hb - ha;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;

  return oklchToHex({
    l: a.l + (b.l - a.l) * k,
    c: a.c + (b.c - a.c) * k,
    h: (ha + dh * k + 360) % 360,
  });
}
