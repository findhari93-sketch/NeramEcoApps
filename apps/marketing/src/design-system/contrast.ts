/** WCAG contrast ratio helpers for the styleguide swatches. */

type RGB = [number, number, number];

function parse(color: string, over?: RGB): RGB {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba && over) {
    const a = Number(rgba[4]);
    return [1, 2, 3].map((i, k) => Math.round(Number(rgba[i]) * a + over[k] * (1 - a))) as RGB;
  }
  throw new Error(`Cannot parse colour ${color}`);
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast of fg on bg; an rgba fg is blended over bg first. */
export function contrastRatio(fg: string, bg: string): number {
  const back = parse(bg);
  const [hi, lo] = [luminance(parse(fg, back)), luminance(back)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}
