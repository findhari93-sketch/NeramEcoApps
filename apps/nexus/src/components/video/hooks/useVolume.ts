'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp } from '../format';
import type { VideoTransport } from '../types';

/**
 * Volume, mute, and the one thing students notice most about its absence:
 * remembering what they set last time.
 *
 * `settable` is separate from `muted` on purpose. iOS ignores writes to
 * `video.volume` entirely, so a slider there is a control that visibly moves and
 * changes nothing. It honours `muted`, so the mute button stays and the slider
 * is not rendered at all. A hidden control beats a lying one.
 */

const STORAGE_KEY = 'neram.video.volume';

interface Stored {
  volume: number;
  muted: boolean;
}

function read(): Stored {
  if (typeof window === 'undefined') return { volume: 1, muted: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { volume: 1, muted: false };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      volume: clamp(Number(parsed.volume ?? 1), 0, 1),
      muted: !!parsed.muted,
    };
  } catch {
    // Private mode, a full quota, or a value someone hand-edited.
    return { volume: 1, muted: false };
  }
}

export interface UseVolumeResult {
  volume: number;
  muted: boolean;
  settable: boolean;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  /** Fold a change that arrived from the element back into state. */
  syncFromSurface: (volume: number, muted: boolean) => void;
  /** Called once the transport exists, to push the remembered value onto it. */
  applyToTransport: () => void;
}

export default function useVolume(
  transportRef: React.MutableRefObject<VideoTransport | null>,
): UseVolumeResult {
  const [{ volume, muted }, setState] = useState<Stored>(() => read());
  const [settable, setSettable] = useState(true);
  const lastNonZero = useRef(volume > 0 ? volume : 1);

  const persist = useCallback((next: Stored) => {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Not worth failing a volume change over. */
    }
  }, []);

  const setVolume = useCallback(
    (value: number) => {
      const v = clamp(value, 0, 1);
      if (v > 0) lastNonZero.current = v;
      transportRef.current?.setVolume(v);
      // Dragging to zero is a mute, and dragging back up should unmute without
      // a second gesture.
      transportRef.current?.setMuted(v === 0);
      persist({ volume: v, muted: v === 0 });
    },
    [transportRef, persist],
  );

  const toggleMute = useCallback(() => {
    const next = !muted;
    transportRef.current?.setMuted(next);
    // Unmuting from a zeroed slider has to restore something audible, or the
    // button appears to do nothing.
    if (!next && volume === 0) {
      const restored = lastNonZero.current || 1;
      transportRef.current?.setVolume(restored);
      persist({ volume: restored, muted: false });
      return;
    }
    persist({ volume, muted: next });
  }, [muted, volume, transportRef, persist]);

  const syncFromSurface = useCallback(
    (v: number, m: boolean) => {
      if (v > 0) lastNonZero.current = v;
      persist({ volume: clamp(v, 0, 1), muted: m });
    },
    [persist],
  );

  const applyToTransport = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    setSettable(transport.isVolumeSettable());
    transport.setVolume(volume);
    transport.setMuted(muted);
  }, [transportRef, volume, muted]);

  // Re-probe when the surface swaps underneath us, which the recap does every
  // time it re-mints its grant.
  useEffect(() => {
    const id = setTimeout(() => {
      if (transportRef.current) setSettable(transportRef.current.isVolumeSettable());
    }, 0);
    return () => clearTimeout(id);
  }, [transportRef]);

  return { volume, muted, settable, setVolume, toggleMute, syncFromSurface, applyToTransport };
}
