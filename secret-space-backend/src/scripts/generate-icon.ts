/**
 * One-off script to generate the Android app icon files for The Secret Space.
 *
 * Renders the brand mark — two interlocking circles (rose + gold) on the dark
 * brand background — at 1024×1024 and writes:
 *
 *   secret-space-mobile/assets/icon.png
 *   secret-space-mobile/assets/adaptive-icon-foreground.png
 *
 * Run from `secret-space-backend/`:
 *   npx ts-node src/scripts/generate-icon.ts
 *
 * Re-run any time you want to tweak proportions/colors below.
 */
import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import fs from 'fs';
import path from 'path';

const SIZE = 1024;
const BG = '#0D0D0F';
const ROSE = '#E8637A';
const GOLD = '#C9A96E';

/**
 * Draws the brand mark — two interlocking rings — onto the given context.
 *
 * `safeZoneScale` controls how much of the canvas the design takes up. The
 * main icon (icon.png) uses ~0.55 of the canvas which fills it nicely. The
 * adaptive-icon foreground uses a smaller scale (~0.42) because Android
 * launchers crop the outer ~17% with their mask (circle/squircle/etc.) and
 * we don't want the rings getting clipped.
 */
function drawBrandMark(
  ctx: CanvasRenderingContext2D,
  opts: { withBackground: boolean; safeZoneScale: number }
) {
  if (opts.withBackground) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  const center = SIZE / 2;
  // Each ring has radius = safeZoneScale * SIZE * 0.5 / 2 — i.e. half the safe
  // zone's half-width, leaving room for the second ring beside it.
  const ringRadius = (SIZE * opts.safeZoneScale) / 4;
  // Horizontal overlap: rings sit close enough that they cross. Move each
  // ring's center inward from where two non-overlapping rings would sit, by
  // ~30% of the ring radius.
  const ringOverlap = ringRadius * 0.3;
  const leftCx = center - ringRadius + ringOverlap;
  const rightCx = center + ringRadius - ringOverlap;
  const cy = center;
  const stroke = ringRadius * 0.11;

  // Soft outer glow on each ring — recreates the gentle bloom in the brand
  // mark. We paint each ring twice: once with shadowBlur for the glow, once
  // without for a crisp stroke on top.
  const drawRing = (cx: number, color: string) => {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = SIZE * 0.05;
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    // Second pass: tighter line on top of the glow so the ring edge stays
    // crisp instead of being eaten by the blur.
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  };

  drawRing(leftCx, ROSE);
  drawRing(rightCx, GOLD);

  // Subtle "blend" indicator in the overlap: a soft rose-into-gold gradient
  // arc that hints at the interlock without redrawing pixels behind it. We
  // use `globalCompositeOperation: 'lighter'` so the overlap is additive
  // (matches the brand mark in the app where the cross-section glows warm).
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#D88670'; // halfway between rose and gold
  ctx.lineWidth = stroke * 1.4;
  // Only the overlapping middle portion. We clip to a vertical band centered
  // on the canvas and re-stroke the rings inside that band so it lights up.
  ctx.beginPath();
  const bandWidth = ringRadius * 0.55;
  ctx.rect(center - bandWidth, 0, bandWidth * 2, SIZE);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(leftCx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rightCx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function writeIcon(filename: string, withBackground: boolean, safeZoneScale: number) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  drawBrandMark(ctx, { withBackground, safeZoneScale });

  const outPath = path.resolve(__dirname, '../../../secret-space-mobile/assets', filename);
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log(`✅ Wrote ${outPath}`);
}

// icon.png — full 1024 with background. Used as the app launcher icon on
// older Android (no adaptive icon support) and as the fallback Expo uses
// in places like the splash, recent tasks list, etc.
writeIcon('icon.png', true, 0.55);

// adaptive-icon-foreground.png — no background (the adaptiveIcon.backgroundColor
// in app.json paints behind it). Smaller safe zone so the launcher mask
// can crop the outer area without eating the rings.
writeIcon('adaptive-icon-foreground.png', false, 0.42);

console.log('🎨 Icons generated.');
