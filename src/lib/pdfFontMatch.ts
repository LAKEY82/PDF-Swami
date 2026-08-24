import { StandardFonts } from 'pdf-lib';

export interface DetectedFontInfo {
  family: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Maps a detected CSS font-family (plus weight/style flags) to the closest
 * of pdf-lib's 14 standard fonts. There is no embedded-font-file lookup here
 * by design - it's a same-family approximation (serif -> Times, monospace ->
 * Courier, everything else -> Helvetica), not a pixel-perfect font match.
 */
export function matchStandardFont({ family, bold, italic }: DetectedFontInfo): StandardFonts {
  const f = family.toLowerCase();
  const isMono = /courier|mono|consolas|menlo|monaco/.test(f);
  // "sans-serif" contains the substring "serif", so it must be excluded
  // explicitly rather than relying on a plain /serif/ match.
  const isSerif = !isMono && !/sans-serif|sans serif/.test(f) && /times|serif|georgia|garamond|cambria|book|minion|palatino/.test(f);

  if (isMono) {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }

  if (isSerif) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }

  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/** Human-readable label for the sidebar metadata panel. */
export function describeStandardFont(font: StandardFonts): string {
  const labels: Record<string, string> = {
    [StandardFonts.Helvetica]: 'Helvetica',
    [StandardFonts.HelveticaBold]: 'Helvetica Bold',
    [StandardFonts.HelveticaOblique]: 'Helvetica Italic',
    [StandardFonts.HelveticaBoldOblique]: 'Helvetica Bold Italic',
    [StandardFonts.TimesRoman]: 'Times Roman',
    [StandardFonts.TimesRomanBold]: 'Times Bold',
    [StandardFonts.TimesRomanItalic]: 'Times Italic',
    [StandardFonts.TimesRomanBoldItalic]: 'Times Bold Italic',
    [StandardFonts.Courier]: 'Courier',
    [StandardFonts.CourierBold]: 'Courier Bold',
    [StandardFonts.CourierOblique]: 'Courier Italic',
    [StandardFonts.CourierBoldOblique]: 'Courier Bold Italic',
  };
  return labels[font] ?? font;
}
