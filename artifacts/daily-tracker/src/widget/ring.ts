/**
 * Progress ring as an SVG string for the widget renderer (AndroidSVG draws it).
 * Same geometry as the in-app ring: a track and an arc that starts at 12 o'clock.
 */
import colors from '@/constants/colors';

export interface RingOptions {
  size: number;
  ratio: number;
  color: string;
  track?: string;
  stroke?: number;
}

export function ringSvg({ size, ratio, color, track = colors.dark.hairline, stroke }: RingOptions): string {
  const w = stroke ?? Math.max(4, Math.round(size * 0.11));
  const r = (size - w) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const dash = clamped * c;
  const centre = size / 2;
  const arc =
    dash > 0
      ? `<circle cx="${centre}" cy="${centre}" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${centre} ${centre})"/>`
      : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${centre}" cy="${centre}" r="${r.toFixed(2)}" fill="none" stroke="${track}" stroke-width="${w}"/>` +
    arc +
    `</svg>`
  );
}
