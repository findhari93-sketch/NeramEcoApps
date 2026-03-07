'use client';

import { useRef, useEffect } from 'react';
import { Box } from '@neram/ui';

// Color palette
const GOLD = '#e8a020';
const GOLD_L = '#f4bf5a';
const BLUE = '#1a8fff';
const WHITE = 'rgba(245,240,232,0.9)';
const NAVY = '#060d1f';

const BASE_SIZE = 460;

/**
 * ClockCanvas — Architectural live clock with blueprint ring, compass, and aiArchitek arc.
 * Shows real time. Responsive: 280px mobile, 340px tablet, 460px desktop.
 */
export default function ClockCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const ringAngleRef = useRef(0);
  const innerRingAngleRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let size: number;
    let CX: number;
    let CY: number;
    let R: number;

    function setupCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      size = rect.width;
      CX = size / 2;
      CY = size / 2;
      R = size * (190 / BASE_SIZE);
    }

    setupCanvas();

    function drawGlow(x: number, y: number, r: number, color: string, a: number) {
      const grad = ctx!.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color.replace('rgb', 'rgba').replace(')', `,${a})`));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx!.fillStyle = grad;
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, Math.PI * 2);
      ctx!.fill();
    }

    function drawBlueprintRing() {
      ctx!.save();
      ctx!.translate(CX, CY);
      ctx!.rotate(ringAngleRef.current);

      // Outer dashed ring
      ctx!.beginPath();
      ctx!.arc(0, 0, R + 22, 0, Math.PI * 2);
      ctx!.strokeStyle = 'rgba(26,143,255,0.25)';
      ctx!.lineWidth = 1;
      ctx!.setLineDash([4, 14]);
      ctx!.stroke();
      ctx!.setLineDash([]);

      // Tick marks
      for (let i = 0; i < 72; i++) {
        const angle = (i / 72) * Math.PI * 2;
        const len = i % 6 === 0 ? 12 : i % 3 === 0 ? 7 : 4;
        const r1 = R + 28;
        const r2 = r1 + len;
        ctx!.beginPath();
        ctx!.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
        ctx!.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
        ctx!.strokeStyle = i % 6 === 0 ? 'rgba(232,160,32,0.6)' : 'rgba(255,255,255,0.12)';
        ctx!.lineWidth = i % 6 === 0 ? 1.5 : 0.5;
        ctx!.stroke();
      }
      ctx!.restore();
    }

    function drawCompassPoints() {
      ctx!.save();
      ctx!.translate(CX, CY);
      const dirs = ['N', 'E', 'S', 'W'];
      dirs.forEach((d, i) => {
        const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const rr = R + 50;
        ctx!.font = `700 ${11 * (size / BASE_SIZE)}px "Space Mono", monospace`;
        ctx!.fillStyle = d === 'N' ? GOLD : 'rgba(245,240,232,0.35)';
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText(d, Math.cos(angle) * rr, Math.sin(angle) * rr);
      });
      ctx!.restore();
    }

    function drawFaceDetails() {
      // Spinning inner elements (anticlockwise)
      ctx!.save();
      ctx!.translate(CX, CY);
      ctx!.rotate(innerRingAngleRef.current);

      // Concentric circles
      [R * 0.85, R * 0.55, R * 0.3].forEach((r) => {
        ctx!.beginPath();
        ctx!.arc(0, 0, r, 0, Math.PI * 2);
        ctx!.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx!.lineWidth = 1;
        ctx!.stroke();
      });

      // Hour markers
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const inner = R * 0.82;
        const outer = R * 0.92;
        ctx!.beginPath();
        ctx!.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx!.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx!.strokeStyle = i === 0 ? GOLD : 'rgba(245,240,232,0.35)';
        ctx!.lineWidth = i % 3 === 0 ? 2.5 : 1;
        ctx!.stroke();
      }

      // Minute dots
      for (let i = 0; i < 60; i++) {
        if (i % 5 === 0) continue;
        const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const rr = R * 0.87;
        ctx!.beginPath();
        ctx!.arc(Math.cos(angle) * rr, Math.sin(angle) * rr, 1, 0, Math.PI * 2);
        ctx!.fillStyle = 'rgba(255,255,255,0.15)';
        ctx!.fill();
      }

      ctx!.restore();

      // Center NERAM text (static, no rotation)
      const scale = size / BASE_SIZE;
      ctx!.font = `700 ${11 * scale}px "Space Mono", monospace`;
      ctx!.fillStyle = GOLD;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillText('NERAM', CX, CY - 38 * scale);

      ctx!.font = `300 ${9 * scale}px "DM Sans", sans-serif`;
      ctx!.fillStyle = 'rgba(245,240,232,0.3)';
      ctx!.fillText('நேரம்  ·  TIME', CX, CY + 44 * scale);
    }

    function drawHand(angle: number, length: number, width: number, color: string, hasCap: boolean) {
      ctx!.save();
      ctx!.translate(CX, CY);
      ctx!.rotate(angle);

      const w = width;
      const l = length;
      const tail = length * 0.2;

      ctx!.beginPath();
      ctx!.moveTo(-w / 2, tail);
      ctx!.lineTo(-w / 2, -l * 0.7);
      ctx!.lineTo(0, -l);
      ctx!.lineTo(w / 2, -l * 0.7);
      ctx!.lineTo(w / 2, tail);
      ctx!.closePath();
      ctx!.fillStyle = color;
      ctx!.fill();

      if (hasCap) {
        ctx!.beginPath();
        ctx!.arc(0, -l * 0.55, w / 2 + 2, 0, Math.PI * 2);
        ctx!.fillStyle = 'rgba(6,13,31,0.8)';
        ctx!.fill();
        ctx!.beginPath();
        ctx!.arc(0, -l * 0.55, 2, 0, Math.PI * 2);
        ctx!.fillStyle = color;
        ctx!.fill();
      }

      ctx!.restore();
    }

    function drawSecondHand(angle: number) {
      ctx!.save();
      ctx!.translate(CX, CY);
      ctx!.rotate(angle);

      ctx!.beginPath();
      ctx!.moveTo(0, R * 0.25);
      ctx!.lineTo(0, -R * 0.85);
      ctx!.strokeStyle = BLUE;
      ctx!.lineWidth = 1;
      ctx!.stroke();

      // Counterbalance circle
      ctx!.beginPath();
      ctx!.arc(0, R * 0.15, 4, 0, Math.PI * 2);
      ctx!.fillStyle = BLUE;
      ctx!.fill();

      ctx!.restore();
    }

    function drawCenter() {
      ctx!.beginPath();
      ctx!.arc(CX, CY, 10, 0, Math.PI * 2);
      ctx!.fillStyle = GOLD;
      ctx!.fill();

      ctx!.beginPath();
      ctx!.arc(CX, CY, 4, 0, Math.PI * 2);
      ctx!.fillStyle = NAVY;
      ctx!.fill();

      ctx!.beginPath();
      ctx!.arc(CX, CY, 2, 0, Math.PI * 2);
      ctx!.fillStyle = GOLD;
      ctx!.fill();
    }

    function drawaiArchitekIndicator() {
      ctx!.save();
      ctx!.translate(CX, CY);

      const now = new Date();
      const aiProgress = (now.getSeconds() + now.getMilliseconds() / 1000) / 60;

      ctx!.beginPath();
      ctx!.arc(0, 0, R * 0.42, -Math.PI / 2, -Math.PI / 2 + aiProgress * Math.PI * 2);
      ctx!.strokeStyle = 'rgba(26,143,255,0.5)';
      ctx!.lineWidth = 2;
      ctx!.stroke();

      const scale = size / BASE_SIZE;
      ctx!.font = `600 ${10 * scale}px "DM Sans", sans-serif`;
      ctx!.fillStyle = 'rgba(62,184,255,0.6)';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillText('aiArchitek', 0, 0);

      ctx!.restore();
    }

    function tick() {
      ctx!.clearRect(0, 0, size, size);

      const now = new Date();
      const ms = now.getMilliseconds();
      const sec = now.getSeconds() + ms / 1000;
      const min = now.getMinutes() + sec / 60;
      const hr = (now.getHours() % 12) + min / 60;

      const secAngle = (sec / 60) * Math.PI * 2 - Math.PI / 2;
      const minAngle = (min / 60) * Math.PI * 2 - Math.PI / 2;
      const hrAngle = (hr / 12) * Math.PI * 2 - Math.PI / 2;

      // Ambient glow
      drawGlow(CX, CY, R + 60, 'rgb(232,160,32)', 0.06);

      // Blueprint ring (clockwise)
      ringAngleRef.current += 0.0008;
      drawBlueprintRing();

      // Inner face elements (anticlockwise)
      innerRingAngleRef.current -= 0.0006;

      // Clock face
      ctx!.beginPath();
      ctx!.arc(CX, CY, R, 0, Math.PI * 2);
      ctx!.fillStyle = 'rgba(6,13,31,0.75)';
      ctx!.fill();

      // Face border
      ctx!.beginPath();
      ctx!.arc(CX, CY, R, 0, Math.PI * 2);
      ctx!.strokeStyle = 'rgba(232,160,32,0.25)';
      ctx!.lineWidth = 1.5;
      ctx!.stroke();

      drawFaceDetails();
      drawCompassPoints();
      drawaiArchitekIndicator();

      // Hands — real time
      drawHand(hrAngle, R * 0.52, 7, WHITE, true);
      drawHand(minAngle, R * 0.72, 4.5, WHITE, false);
      drawSecondHand(secAngle);
      drawCenter();

      rafRef.current = requestAnimationFrame(tick);
    }

    tick();

    const resizeObserver = new ResizeObserver(() => {
      setupCanvas();
    });
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        opacity: 0,
        animation: 'neramFadeUp 1.2s ease forwards',
        animationDelay: '0.5s',
        transform: 'translateY(16px)',
        maxWidth: { xs: 280, sm: 340, md: 460 },
        mx: 'auto',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          display: 'block',
          filter: 'drop-shadow(0 0 60px rgba(232,160,32,0.15))',
        }}
      />
    </Box>
  );
}
