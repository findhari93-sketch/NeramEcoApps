/**
 * Paint one moment of a "talk while you sketch" timeline onto a canvas.
 *
 * Shared by the inline player (student surfaces) and the review stage replay, so
 * a walkthrough looks the same wherever it is watched.
 *
 * Strokes are always revealed point by point at the speed they were drawn.
 * There used to be a reduced-motion branch that pasted each stroke whole, but a
 * walkthrough is content the viewer chose to play, like a video, not decorative
 * motion. Windows turns the preference on whenever "Animation effects" is off,
 * and that branch is why a teacher saw finished strokes pop in instead of the
 * pen moving with their voice.
 */
import { buildStrokeOutline, smoothCentreline } from '@/lib/sketch-stroke';
import { visibleAt, type SketchTimeline } from '@/lib/sketch-timeline';

const FONT_FAMILY = "'Segoe UI', system-ui, -apple-system, sans-serif";

export function paintSketchFrame(
  ctx: CanvasRenderingContext2D,
  timeline: SketchTimeline,
  ms: number,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);

  for (const item of visibleAt(timeline, ms)) {
    if (item.kind === 'stroke') {
      const points = (item.points || []).map((point) => ({ x: point.x * width, y: point.y * height }));
      if (!points.length) continue;

      // Filled outline, the same renderer the teacher drew against, so a
      // tapered stroke replays as the stroke they actually made. A timeline
      // recorded before pressure existed has none, and comes back at a
      // constant width exactly as it always did.
      const lineWidth = Math.max(1, (item.width || 0) * width);
      const smoothed = smoothCentreline(points, item.pressures);
      const outline = buildStrokeOutline(smoothed.points, smoothed.pressures, lineWidth);
      if (!outline.length) continue;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.moveTo(outline[0].x, outline[0].y);
      for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
      ctx.closePath();
      ctx.fill();
    } else {
      const fontPx = Math.max(10, (item.fontSize || 0) * height);
      const x = (item.x || 0) * width;
      const y = (item.y || 0) * height;
      if (item.leader) {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = Math.max(2, fontPx / 10);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y + fontPx / 2);
        ctx.lineTo(item.leader.x * width, item.leader.y * height);
        ctx.stroke();
      }
      ctx.font = `600 ${fontPx}px ${FONT_FAMILY}`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = item.color;
      (item.text || '').split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * fontPx * 1.25));
    }
  }
}
