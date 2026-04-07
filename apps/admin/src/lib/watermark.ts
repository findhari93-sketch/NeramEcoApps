/**
 * Watermark utility for student result scorecards
 *
 * Applies a semi-transparent diagonal text watermark using sharp.
 * Text-only watermark: "NERAM CLASSES" and "neramclasses.com"
 */

import sharp from 'sharp';

/**
 * Apply a diagonal text watermark to an image buffer.
 *
 * Renders "NERAM CLASSES" and "neramclasses.com" as white text at 25% opacity
 * with a subtle drop shadow, tiled diagonally across the image.
 *
 * @param imageBuffer - The original image as a Buffer
 * @returns The watermarked image as a Buffer (PNG)
 */
export async function applyWatermark(imageBuffer: Buffer): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const width = metadata.width || 800;
  const height = metadata.height || 600;

  // Calculate font size relative to image dimensions (roughly 3% of the diagonal)
  const diagonal = Math.sqrt(width * width + height * height);
  const fontSize = Math.max(16, Math.round(diagonal * 0.03));
  const smallFontSize = Math.round(fontSize * 0.7);

  // Build SVG overlay with repeated diagonal watermark text
  // We tile the watermark text across the image so it covers the entire area
  const spacingX = fontSize * 14;
  const spacingY = fontSize * 6;

  let textElements = '';

  for (let y = -height; y < height * 2; y += spacingY) {
    for (let x = -width; x < width * 2; x += spacingX) {
      // Drop shadow (darker, offset by 1px)
      textElements += `
        <text x="${x + 1}" y="${y + 1}" font-family="Arial, Helvetica, sans-serif"
              font-size="${fontSize}" font-weight="bold" fill="rgba(0,0,0,0.15)"
              transform="rotate(-30, ${x}, ${y})">NERAM CLASSES</text>
        <text x="${x + 1}" y="${y + fontSize + 5}" font-family="Arial, Helvetica, sans-serif"
              font-size="${smallFontSize}" fill="rgba(0,0,0,0.12)"
              transform="rotate(-30, ${x}, ${y})">neramclasses.com</text>
      `;

      // Main white text at 25% opacity
      textElements += `
        <text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif"
              font-size="${fontSize}" font-weight="bold" fill="rgba(255,255,255,0.25)"
              transform="rotate(-30, ${x}, ${y})">NERAM CLASSES</text>
        <text x="${x}" y="${y + fontSize + 4}" font-family="Arial, Helvetica, sans-serif"
              font-size="${smallFontSize}" fill="rgba(255,255,255,0.20)"
              transform="rotate(-30, ${x}, ${y})">neramclasses.com</text>
      `;
    }
  }

  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${textElements}
    </svg>
  `);

  const watermarkedBuffer = await image
    .composite([
      {
        input: svgOverlay,
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  return watermarkedBuffer;
}
