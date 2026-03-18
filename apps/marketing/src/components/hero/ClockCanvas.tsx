'use client';

import { useState, useEffect, useRef } from 'react';
import { Box } from '@neram/ui';

// Color palette
const GOLD = '#e8a020';
const BLUE = '#1a8fff';
const WHITE = 'rgba(245,240,232,0.9)';
const NAVY = '#060d1f';

const BASE = 460;
const CX = BASE / 2;   // 230
const CY = BASE / 2;   // 230
const R = 190;

// Round to 2dp — eliminates Node.js vs browser floating-point hydration mismatch
const rd = (n: number) => Math.round(n * 100) / 100;

/**
 * ClockCanvas — Inception-style animated SVG clock.
 * - Outer blueprint ring (dashes + 72 tick marks): clockwise, 40s/rev
 * - Middle blue dashed ring: counter-clockwise, 25s/rev
 * - Second hand: smooth continuous CSS sweep synced to real local time
 * - Hour/minute hands: real time, updated every second
 */
export default function ClockCanvas() {
  const [time, setTime] = useState<{ h: number; m: number; s: number } | null>(null);
  const secRef = useRef<SVGGElement>(null);

  useEffect(() => {
    // Sync second hand CSS animation to real time via animation-delay (no re-renders)
    if (secRef.current) {
      const now = new Date();
      const offset = -(now.getSeconds() + now.getMilliseconds() / 1000);
      secRef.current.style.animationDelay = `${offset}s`;
    }

    // Update hour + minute hands every second
    const tick = () => {
      const n = new Date();
      setTime({ h: n.getHours(), m: n.getMinutes(), s: n.getSeconds() });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Real time angles — no -90 offset (hands drawn pointing UP = 12 o'clock at 0°)
  const hr  = time ? (time.h % 12) + time.m / 60 : 10 + 10 / 60;
  const min = time ? time.m + time.s / 60         : 10;

  const hrAngle  = (hr  / 12) * 360;
  const minAngle = (min / 60) * 360;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        opacity: 0,
        animation: 'neramFadeUp 1.2s ease forwards',
        animationDelay: '0s',
        transform: 'translateY(16px)',
        maxWidth: { xs: 280, sm: 340, md: 460 },
        mx: 'auto',
      }}
    >
      <svg
        viewBox={`0 0 ${BASE} ${BASE}`}
        style={{ width: '100%', aspectRatio: '1 / 1', display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Neram architectural clock showing real time"
      >
        {/* Gradient definition */}
        <defs>
          <radialGradient id="clock-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(232,160,32,0.06)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {/*
          Animation keyframes — top-level <style> (NOT inside <defs>) so browsers
          apply them correctly to className on SVG elements.
          transform-origin uses SVG coordinate space when scoped inside <svg>.
        */}
        <style>{`
          @keyframes neramCW {
            0%   { transform: rotate(0deg);   }
            25%  { transform: rotate(90deg);  }
            50%  { transform: rotate(180deg); }
            75%  { transform: rotate(270deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes neramCCW {
            0%   { transform: rotate(0deg);    }
            25%  { transform: rotate(-90deg);  }
            50%  { transform: rotate(-180deg); }
            75%  { transform: rotate(-270deg); }
            100% { transform: rotate(-360deg); }
          }
          .neram-cw  { transform-origin: ${CX}px ${CY}px; animation: neramCW  40s linear infinite; }
          .neram-ccw { transform-origin: ${CX}px ${CY}px; animation: neramCCW 25s linear infinite; }
          .neram-sec { transform-origin: ${CX}px ${CY}px; animation: neramCW  60s linear infinite; animation-delay: 0s; }
        `}</style>

        {/* Ambient glow */}
        <circle cx={CX} cy={CY} r={R + 60} fill="url(#clock-glow)" />

        {/* ── OUTER RING: clockwise 40s ── */}
        <g className="neram-cw">
          <circle
            cx={CX} cy={CY} r={R + 22}
            fill="none" stroke="rgba(26,143,255,0.25)" strokeWidth={1} strokeDasharray="4 14"
          />
          {Array.from({ length: 72 }, (_, i) => {
            const angle = (i / 72) * Math.PI * 2;
            const isMajor = i % 6 === 0;
            const isMid   = i % 3 === 0;
            const len = isMajor ? 12 : isMid ? 7 : 4;
            const r1 = R + 28;
            const r2 = r1 + len;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return (
              <line
                key={`bt-${i}`}
                x1={rd(CX + cos * r1)} y1={rd(CY + sin * r1)}
                x2={rd(CX + cos * r2)} y2={rd(CY + sin * r2)}
                stroke={isMajor ? 'rgba(232,160,32,0.6)' : 'rgba(255,255,255,0.12)'}
                strokeWidth={isMajor ? 1.5 : 0.5}
              />
            );
          })}
        </g>

        {/* ── COMPASS POINTS (static) ── */}
        {(['N', 'E', 'S', 'W'] as const).map((d, i) => {
          const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
          const rr = R + 50;
          return (
            <text
              key={d}
              x={rd(CX + Math.cos(angle) * rr)}
              y={rd(CY + Math.sin(angle) * rr)}
              textAnchor="middle"
              dominantBaseline="central"
              fill={d === 'N' ? GOLD : 'rgba(245,240,232,0.35)'}
              fontFamily='"SFMono-Regular", "Cascadia Code", "Consolas", monospace'
              fontWeight={700}
              fontSize={11}
            >
              {d}
            </text>
          );
        })}

        {/* ── CLOCK FACE ── */}
        <circle cx={CX} cy={CY} r={R} fill="rgba(6,13,31,0.75)" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(232,160,32,0.25)" strokeWidth={1.5} />

        {/* ── FACE DETAIL RINGS ── */}
        {/* Outer concentric — static */}
        <circle cx={CX} cy={CY} r={R * 0.85} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1} />

        {/* Middle ring — counter-clockwise 25s */}
        {/* Accent dot at top makes the rotation unmistakably visible as it orbits CCW */}
        <g className="neram-ccw">
          <circle
            cx={CX} cy={CY} r={R * 0.55}
            fill="none"
            stroke={BLUE}
            strokeOpacity={0.3}
            strokeWidth={1}
            strokeDasharray="10 16"
          />
          {/* Bright accent dot — orbits CCW so you can clearly see rotation */}
          <circle
            cx={CX}
            cy={CY - R * 0.55}
            r={3.5}
            fill={BLUE}
            opacity={0.85}
          />
          {/* Small counterweight dot on opposite side */}
          <circle
            cx={CX}
            cy={CY + R * 0.55}
            r={2}
            fill={BLUE}
            opacity={0.4}
          />
        </g>

        {/* Inner concentric — static */}
        <circle cx={CX} cy={CY} r={R * 0.3} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1} />

        {/* ── HOUR MARKERS ── */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const inner = R * 0.82;
          const outer = R * 0.92;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return (
            <line
              key={`hm-${i}`}
              x1={rd(CX + cos * inner)} y1={rd(CY + sin * inner)}
              x2={rd(CX + cos * outer)} y2={rd(CY + sin * outer)}
              stroke={i === 0 ? GOLD : 'rgba(245,240,232,0.35)'}
              strokeWidth={i % 3 === 0 ? 2.5 : 1}
            />
          );
        })}

        {/* ── MINUTE DOTS ── */}
        {Array.from({ length: 60 }, (_, i) => {
          if (i % 5 === 0) return null;
          const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const rr = R * 0.87;
          return (
            <circle
              key={`md-${i}`}
              cx={rd(CX + Math.cos(angle) * rr)}
              cy={rd(CY + Math.sin(angle) * rr)}
              r={1}
              fill="rgba(255,255,255,0.15)"
            />
          );
        })}

        {/* ── LABELS ── */}
        <text
          x={CX} y={CY - 38}
          textAnchor="middle" dominantBaseline="central"
          fill={GOLD}
          fontFamily='"SFMono-Regular", "Cascadia Code", "Consolas", monospace'
          fontWeight={700} fontSize={11}
        >
          NERAM
        </text>
        <text
          x={CX} y={CY + 44}
          textAnchor="middle" dominantBaseline="central"
          fill="rgba(245,240,232,0.3)"
          fontFamily='"Inter", sans-serif'
          fontWeight={300} fontSize={9}
        >
          {'நேரம்  ·  TIME'}
        </text>

        {/* ── aiArchitek ARC ── */}
        {(() => {
          const arcR = R * 0.42;
          const progress = 0.4;
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + progress * Math.PI * 2;
          const x1 = rd(CX + Math.cos(startAngle) * arcR);
          const y1 = rd(CY + Math.sin(startAngle) * arcR);
          const x2 = rd(CX + Math.cos(endAngle) * arcR);
          const y2 = rd(CY + Math.sin(endAngle) * arcR);
          const largeArc = progress > 0.5 ? 1 : 0;
          return (
            <path
              d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none" stroke="rgba(26,143,255,0.5)" strokeWidth={2}
            />
          );
        })()}
        <text
          x={CX} y={CY}
          textAnchor="middle" dominantBaseline="central"
          fill="rgba(62,184,255,0.6)"
          fontFamily='"Inter", sans-serif'
          fontWeight={600} fontSize={10}
        >
          aiArchitek
        </text>

        {/* ── HOUR HAND — real time ── */}
        <g transform={`rotate(${rd(hrAngle)} ${CX} ${CY})`}>
          <polygon
            points={`${CX - 3.5},${CY + R * 0.52 * 0.2} ${CX - 3.5},${CY - R * 0.52 * 0.7} ${CX},${CY - R * 0.52} ${CX + 3.5},${CY - R * 0.52 * 0.7} ${CX + 3.5},${CY + R * 0.52 * 0.2}`}
            fill={WHITE}
          />
          <circle cx={CX} cy={rd(CY - R * 0.52 * 0.55)} r={5.5} fill="rgba(6,13,31,0.8)" />
          <circle cx={CX} cy={rd(CY - R * 0.52 * 0.55)} r={2}   fill={WHITE} />
        </g>

        {/* ── MINUTE HAND — real time ── */}
        <g transform={`rotate(${rd(minAngle)} ${CX} ${CY})`}>
          <polygon
            points={`${CX - 2.25},${CY + R * 0.72 * 0.2} ${CX - 2.25},${CY - R * 0.72 * 0.7} ${CX},${CY - R * 0.72} ${CX + 2.25},${CY - R * 0.72 * 0.7} ${CX + 2.25},${CY + R * 0.72 * 0.2}`}
            fill={WHITE}
          />
        </g>

        {/*
          ── SECOND HAND — smooth continuous CSS sweep ──
          CSS class `neram-sec` animates continuously (60s/rev).
          animation-delay is set by ref after mount to sync to real seconds.
          No re-renders needed — purely CSS-driven after initial sync.
        */}
        <g ref={secRef} className="neram-sec">
          <line
            x1={CX} y1={rd(CY + R * 0.25)}
            x2={CX} y2={rd(CY - R * 0.85)}
            stroke={BLUE} strokeWidth={1.5}
          />
          <circle cx={CX} cy={rd(CY + R * 0.15)} r={4} fill={BLUE} />
        </g>

        {/* ── CENTER CAP ── */}
        <circle cx={CX} cy={CY} r={10} fill={GOLD} />
        <circle cx={CX} cy={CY} r={4}  fill={NAVY} />
        <circle cx={CX} cy={CY} r={2}  fill={GOLD} />
      </svg>
    </Box>
  );
}
