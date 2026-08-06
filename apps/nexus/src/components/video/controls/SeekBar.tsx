'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Typography } from '@neram/ui';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import { clamp, formatClock, formatSpoken, ratioFromClientX, type TimeRange } from '../format';

/**
 * The scrub bar, and the only file in the player that owns pointer geometry.
 *
 * It replaces a MUI Slider whose `max` was the unlocked boundary. That made the
 * skip impossible to express, which was right, but it also made the locked part
 * of the lecture invisible: students saw a bar that stopped early, with no clue
 * why or how much was left. This bar spans the whole video and DRAWS the lock.
 *
 * The gate is not softened to buy that. Every commit runs through `commit()`,
 * which clamps to `seekCeiling`, and `commit` is called from exactly three
 * places: pointerdown, pointerup, keydown. Nothing else calls `onSeek`.
 *
 * The other half of the guarantee is that `pointermove` does NOT commit. It
 * moves a local drag value, and the rendered thumb is `min(dragRaw, ceiling)`,
 * so the thumb physically sticks at the lock marker and the gesture still cannot
 * express a skip. That is the direct descendant of the old `max`.
 *
 * Not committing on move matters for a second reason: useVideoProgress counts
 * refusals as a watch-honesty signal, and a refusal per pointermove would post
 * dozens of them for one drag across the locked region.
 *
 * This file never imports VideoTransport or VideoGate. It takes numbers and
 * callbacks, so it cannot recompute a boundary and cannot disagree with one.
 */

export interface SeekMark {
  id: string;
  at: number;
  label: string;
  passed?: boolean;
}

export interface SeekBarProps {
  current: number;
  /** The bar always spans 0..duration, whatever the ceiling is. */
  duration: number;
  /** Infinity means unbounded. The only limit this component knows about. */
  seekCeiling: number;
  buffered: ReadonlyArray<TimeRange>;
  marks?: SeekMark[];
  /** Only ever called with an already-clamped value. */
  onSeek: (seconds: number) => void;
  /** A move past the ceiling was refused. */
  onRefused: () => void;
  /** Holds the controls open while a drag is in progress. */
  onScrubbingChange?: (scrubbing: boolean) => void;
  disabled?: boolean;
}

const PLAYED = '#42A5F5';

export default function SeekBar({
  current,
  duration,
  seekCeiling,
  buffered,
  marks = [],
  onSeek,
  onRefused,
  onScrubbingChange,
  disabled = false,
}: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  /**
   * The drag position twice: a ref for the commit, state for the thumb.
   *
   * The commit must not depend on React having re-rendered between pointerdown
   * and pointerup. Those two can land in the same batch, and a commit that read
   * the state would then see the position from before the drag and quietly seek
   * to where the finger started.
   */
  const dragRef = useRef<number | null>(null);
  const [dragRaw, setDragRaw] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);

  const setDrag = useCallback((value: number | null) => {
    dragRef.current = value;
    setDragRaw(value);
  }, []);

  const bounded = Number.isFinite(seekCeiling);
  const lockedAt = bounded && duration > 0 && seekCeiling < duration - 1 ? seekCeiling : null;

  /**
   * The single clamp. Three callers, no others.
   *
   * A refused move lands ON the boundary rather than being dropped: a control
   * that does nothing at all reads as broken, and landing on the boundary is
   * also where the student needs to be to open the checkpoint.
   */
  const commit = useCallback(
    (seconds: number) => {
      const capped = clamp(seconds, 0, duration || seconds);
      if (bounded && capped > seekCeiling) {
        onSeek(Math.max(0, seekCeiling));
        onRefused();
        return;
      }
      onSeek(capped);
    },
    [bounded, seekCeiling, duration, onSeek, onRefused],
  );

  const timeAt = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return ratioFromClientX(clientX, rect) * (duration || 0);
    },
    [duration],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !duration) return;
      // A tap is a zero-length drag. Without committing here, a tap on a phone
      // would do nothing at all, since no pointermove ever arrives.
      const t = timeAt(e.clientX);
      trackRef.current?.setPointerCapture?.(e.pointerId);
      setDrag(t);
      onScrubbingChange?.(true);
      commit(t);
    },
    [disabled, duration, timeAt, commit, onScrubbingChange, setDrag],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !duration) return;
      const t = timeAt(e.clientX);
      // Deliberately no commit. See the file docblock.
      if (dragRef.current !== null) setDrag(t);
      else setHover({ x: e.clientX - (trackRef.current?.getBoundingClientRect().left ?? 0), t });
    },
    [disabled, duration, timeAt, setDrag],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current === null) return;
      trackRef.current?.releasePointerCapture?.(e.pointerId);
      // Where the pointer was released wins over the last move we happened to
      // see. A browser is not obliged to send a final pointermove before
      // pointerup, and on touch it frequently does not, which would commit the
      // position the finger started at rather than where it let go.
      const at = Number.isFinite(e.clientX) ? timeAt(e.clientX) : dragRef.current;
      commit(at);
      setDrag(null);
      onScrubbingChange?.(false);
    },
    [commit, onScrubbingChange, setDrag, timeAt],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled || !duration) return;
      const step = (delta: number) => {
        e.preventDefault();
        commit(current + delta);
      };
      switch (e.key) {
        case 'ArrowLeft':
          return step(-5);
        case 'ArrowRight':
          return step(5);
        case 'ArrowDown':
          return step(-10);
        case 'ArrowUp':
          return step(10);
        case 'PageDown':
          return step(-60);
        case 'PageUp':
          return step(60);
        case 'Home':
          e.preventDefault();
          return commit(0);
        case 'End':
          e.preventDefault();
          // Asks for the actual end and lets commit decide. Clamping here first
          // would be a second copy of the rule, and it would also hide the
          // refusal: the student did ask to cross the boundary, and that is
          // exactly what the honesty signal is counting.
          return commit(duration);
        default:
      }
    },
    [disabled, duration, current, commit],
  );

  // What the thumb shows: the drag position while dragging, clamped, so the
  // thumb sticks at the lock rather than sliding into territory it cannot reach.
  const displayed = dragRaw !== null ? Math.min(dragRaw, bounded ? seekCeiling : dragRaw) : current;
  const pct = useCallback(
    (seconds: number) => (duration > 0 ? clamp(seconds / duration, 0, 1) * 100 : 0),
    [duration],
  );

  const bufferedBars = useMemo(
    () =>
      buffered.map(([start, end], i) => (
        <Box
          key={`${start}-${end}-${i}`}
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${pct(start)}%`,
            width: `${Math.max(0, pct(end) - pct(start))}%`,
            bgcolor: 'rgba(255,255,255,0.45)',
            borderRadius: 999,
          }}
        />
      )),
    [buffered, pct],
  );

  const hoveringLocked = hover !== null && lockedAt !== null && hover.t > lockedAt;

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {hover && !disabled && duration > 0 && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: hover.x,
            transform: 'translateX(-50%)',
            // A plain box, not MUI Tooltip: Tooltip portals (which reintroduces
            // the fullscreen problem this player just solved) and its enter delay
            // is wrong for something that must track a moving cursor.
            pointerEvents: 'none',
            bgcolor: 'rgba(0,0,0,0.88)',
            color: '#fff',
            px: 1,
            py: 0.25,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            whiteSpace: 'nowrap',
            zIndex: 2,
          }}
        >
          {hoveringLocked && <LockRoundedIcon sx={{ fontSize: 12 }} />}
          <Typography sx={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {hoveringLocked ? 'Pass this checkpoint first' : formatClock(hover.t)}
          </Typography>
        </Box>
      )}

      <Box
        ref={trackRef}
        data-testid="seek-rail"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Seek"
        aria-valuemin={0}
        // The REAL duration, not the ceiling. The bar genuinely spans the whole
        // video now, and telling a screen reader a 45 minute class is 2 minutes
        // long to buy a tidier test assertion is the wrong trade. The lock is
        // announced in aria-valuetext instead.
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(displayed)}
        aria-valuetext={
          lockedAt !== null
            ? `${formatSpoken(displayed)} of ${formatSpoken(duration)}. Locked after ${formatSpoken(lockedAt)} until you pass the checkpoint.`
            : `${formatSpoken(displayed)} of ${formatSpoken(duration)}`
        }
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        sx={{
          position: 'relative',
          // A 44px grab area around a 4px bar. touchAction none so a horizontal
          // drag is not stolen by the page's vertical scroll.
          height: 44,
          display: 'flex',
          alignItems: 'center',
          cursor: disabled ? 'default' : 'pointer',
          touchAction: 'none',
          outline: 'none',
          '&:focus-visible .seek-rail-inner': {
            boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
          },
          '&:hover .seek-rail-inner, &:focus-visible .seek-rail-inner': { height: 6 },
          '&:hover .seek-thumb, &:focus-visible .seek-thumb': { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        }}
      >
        <Box
          className="seek-rail-inner"
          sx={{
            position: 'relative',
            width: '100%',
            height: dragRaw !== null ? 6 : 4,
            borderRadius: 999,
            bgcolor: 'rgba(255,255,255,0.28)',
            transition: 'height 120ms ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          {bufferedBars}

          {lockedAt !== null && (
            <Box
              data-testid="seek-locked-region"
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${pct(lockedAt)}%`,
                right: 0,
                borderRadius: 999,
                // Hatched rather than merely dim, so it reads as "not yours yet"
                // instead of as "not loaded".
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(0,0,0,0.45) 0 4px, rgba(255,255,255,0.12) 4px 8px)',
              }}
            />
          )}

          <Box
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${pct(displayed)}%`,
              bgcolor: PLAYED,
              borderRadius: 999,
            }}
          />

          {marks.map((m) => {
            // A question count on a checkpoint the student has not reached leaks
            // the shape of content that is deliberately locked. Position only.
            const beyond = lockedAt !== null && m.at > lockedAt;
            return (
              <Box
                key={m.id}
                aria-hidden
                title={beyond ? undefined : m.label}
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: `${pct(m.at)}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 3,
                  height: 10,
                  borderRadius: 1,
                  bgcolor: m.passed ? '#66BB6A' : beyond ? 'rgba(255,255,255,0.55)' : '#FFB300',
                }}
              />
            );
          })}

          {lockedAt !== null && (
            <Box
              data-testid="seek-lock-marker"
              aria-hidden
              style={{ left: `${pct(lockedAt)}%` }}
              sx={{
                position: 'absolute',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 18,
                height: 18,
                borderRadius: '50%',
                bgcolor: 'rgba(0,0,0,0.75)',
                border: '1px solid rgba(255,255,255,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LockRoundedIcon sx={{ fontSize: 11, color: '#fff' }} />
            </Box>
          )}

          <Box
            className="seek-thumb"
            data-testid="seek-thumb"
            sx={{
              position: 'absolute',
              top: '50%',
              left: `${pct(displayed)}%`,
              transform: 'translate(-50%, -50%) scale(0.6)',
              width: dragRaw !== null ? 18 : 14,
              height: dragRaw !== null ? 18 : 14,
              borderRadius: '50%',
              bgcolor: '#fff',
              // Hidden until intent on pointer devices, always there on touch,
              // where there is no hover to reveal it.
              opacity: dragRaw !== null ? 1 : 0,
              transition: 'opacity 120ms ease, transform 120ms ease',
              '@media (hover: none)': { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
