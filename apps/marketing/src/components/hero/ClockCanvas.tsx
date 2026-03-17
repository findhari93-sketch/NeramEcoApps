'use client';

import { Box } from '@neram/ui';

// Color palette
const GOLD = '#e8a020';
const BLUE = '#1a8fff';
const WHITE = 'rgba(245,240,232,0.9)';
const NAVY = '#060d1f';

const BASE = 460;
const CX = BASE / 2;
const CY = BASE / 2;
const R = 190; // (190 / 460) * 460

// Fixed time: 10:10 (classic watch display)
const HR = 10 + 10 / 60; // 10 hours 10 minutes
const MIN = 10; // 10 minutes
const hrAngle = (HR / 12) * 360 - 90;
const minAngle = (MIN / 60) * 360 - 90;

/**
 * ClockCanvas — Static SVG architectural clock with blueprint ring, compass, and aiArchitek arc.
 * Shows fixed 10:10 time. Responsive: 280px mobile, 340px tablet, 460px desktop.
 * Zero animation loops — renders once.
 */
export default function ClockCanvas() {
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
        aria-label="Neram architectural clock showing 10:10"
      >
        {/* Ambient glow */}
        <defs>
          <radialGradient id="clock-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(232,160,32,0.06)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={R + 60} fill="url(#clock-glow)" />

        {/* === Blueprint Ring === */}
        {/* Outer dashed ring */}
        <circle
          cx={CX}
          cy={CY}
          r={R + 22}
          fill="none"
          stroke="rgba(26,143,255,0.25)"
          strokeWidth={1}
          strokeDasharray="4 14"
        />

        {/* Blueprint tick marks (72 ticks) */}
        {Array.from({ length: 72 }, (_, i) => {
          const angle = (i / 72) * Math.PI * 2;
          const isMajor = i % 6 === 0;
          const isMid = i % 3 === 0;
          const len = isMajor ? 12 : isMid ? 7 : 4;
          const r1 = R + 28;
          const r2 = r1 + len;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return (
            <line
              key={`bt-${i}`}
              x1={CX + cos * r1}
              y1={CY + sin * r1}
              x2={CX + cos * r2}
              y2={CY + sin * r2}
              stroke={isMajor ? 'rgba(232,160,32,0.6)' : 'rgba(255,255,255,0.12)'}
              strokeWidth={isMajor ? 1.5 : 0.5}
            />
          );
        })}

        {/* === Compass Points === */}
        {(['N', 'E', 'S', 'W'] as const).map((d, i) => {
          const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
          const rr = R + 50;
          return (
            <text
              key={d}
              x={CX + Math.cos(angle) * rr}
              y={CY + Math.sin(angle) * rr}
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

        {/* === Clock Face === */}
        <circle cx={CX} cy={CY} r={R} fill="rgba(6,13,31,0.75)" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(232,160,32,0.25)" strokeWidth={1.5} />

        {/* === Face Details === */}
        {/* Concentric circles */}
        {[R * 0.85, R * 0.55, R * 0.3].map((r) => (
          <circle
            key={`cc-${r}`}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}

        {/* Hour markers */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const inner = R * 0.82;
          const outer = R * 0.92;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return (
            <line
              key={`hm-${i}`}
              x1={CX + cos * inner}
              y1={CY + sin * inner}
              x2={CX + cos * outer}
              y2={CY + sin * outer}
              stroke={i === 0 ? GOLD : 'rgba(245,240,232,0.35)'}
              strokeWidth={i % 3 === 0 ? 2.5 : 1}
            />
          );
        })}

        {/* Minute dots */}
        {Array.from({ length: 60 }, (_, i) => {
          if (i % 5 === 0) return null;
          const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const rr = R * 0.87;
          return (
            <circle
              key={`md-${i}`}
              cx={CX + Math.cos(angle) * rr}
              cy={CY + Math.sin(angle) * rr}
              r={1}
              fill="rgba(255,255,255,0.15)"
            />
          );
        })}

        {/* NERAM text */}
        <text
          x={CX}
          y={CY - 38}
          textAnchor="middle"
          dominantBaseline="central"
          fill={GOLD}
          fontFamily='"SFMono-Regular", "Cascadia Code", "Consolas", monospace'
          fontWeight={700}
          fontSize={11}
        >
          NERAM
        </text>

        {/* நேரம் · TIME text */}
        <text
          x={CX}
          y={CY + 44}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(245,240,232,0.3)"
          fontFamily='"Inter", sans-serif'
          fontWeight={300}
          fontSize={9}
        >
          {'நேரம்  ·  TIME'}
        </text>

        {/* === aiArchitek indicator === */}
        {/* Arc at ~40% progress (static representation) */}
        {(() => {
          const arcR = R * 0.42;
          const progress = 0.4; // fixed 40% progress
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + progress * Math.PI * 2;
          const x1 = CX + Math.cos(startAngle) * arcR;
          const y1 = CY + Math.sin(startAngle) * arcR;
          const x2 = CX + Math.cos(endAngle) * arcR;
          const y2 = CY + Math.sin(endAngle) * arcR;
          const largeArc = progress > 0.5 ? 1 : 0;
          return (
            <path
              d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none"
              stroke="rgba(26,143,255,0.5)"
              strokeWidth={2}
            />
          );
        })()}

        <text
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(62,184,255,0.6)"
          fontFamily='"Inter", sans-serif'
          fontWeight={600}
          fontSize={10}
        >
          aiArchitek
        </text>

        {/* === Clock Hands (10:10) === */}
        {/* Hour hand */}
        <g transform={`rotate(${hrAngle} ${CX} ${CY})`}>
          <polygon
            points={`${CX - 3.5},${CY + R * 0.52 * 0.2} ${CX - 3.5},${CY - R * 0.52 * 0.7} ${CX},${CY - R * 0.52} ${CX + 3.5},${CY - R * 0.52 * 0.7} ${CX + 3.5},${CY + R * 0.52 * 0.2}`}
            fill={WHITE}
          />
          {/* Cap */}
          <circle cx={CX} cy={CY - R * 0.52 * 0.55} r={5.5} fill="rgba(6,13,31,0.8)" />
          <circle cx={CX} cy={CY - R * 0.52 * 0.55} r={2} fill={WHITE} />
        </g>

        {/* Minute hand */}
        <g transform={`rotate(${minAngle} ${CX} ${CY})`}>
          <polygon
            points={`${CX - 2.25},${CY + R * 0.72 * 0.2} ${CX - 2.25},${CY - R * 0.72 * 0.7} ${CX},${CY - R * 0.72} ${CX + 2.25},${CY - R * 0.72 * 0.7} ${CX + 2.25},${CY + R * 0.72 * 0.2}`}
            fill={WHITE}
          />
        </g>

        {/* Second hand — animated with CSS rotation (60s per revolution) */}
        <g style={{ transformOrigin: `${CX}px ${CY}px`, animation: 'neramSecondHand 60s linear infinite' }}>
          <line
            x1={CX}
            y1={CY + R * 0.25}
            x2={CX}
            y2={CY - R * 0.85}
            stroke={BLUE}
            strokeWidth={1}
          />
          <circle cx={CX} cy={CY + R * 0.15} r={4} fill={BLUE} />
        </g>

        {/* === Center Cap === */}
        <circle cx={CX} cy={CY} r={10} fill={GOLD} />
        <circle cx={CX} cy={CY} r={4} fill={NAVY} />
        <circle cx={CX} cy={CY} r={2} fill={GOLD} />
      </svg>
    </Box>
  );
}
