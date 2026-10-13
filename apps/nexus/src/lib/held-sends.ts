/**
 * Hold an outward message for a short window so it can be taken back.
 *
 * A sketch reaction becomes a Teams chat to the student, and a Teams chat cannot
 * be unsent. Flip through moves on the instant a teacher taps, so a mis-tap has
 * to cost nothing: each send waits `holdMs`, a second tap on the same sketch
 * replaces the first, and Undo cancels it outright. `flush` sends everything
 * held at once, for a tab that is closing or a screen being left.
 *
 * Framework free and timer driven, so the rules are tested without React.
 */

export interface HeldSendsOptions<P> {
  holdMs: number;
  commit: (key: string, payload: P) => Promise<void>;
  onError: (key: string, payload: P, error: unknown) => void;
  onCommitted?: (key: string, payload: P) => void;
}

export interface HeldSends<P> {
  /** Start (or restart) the window for this key with this payload. `holdMs` overrides the default for this one. */
  hold: (key: string, payload: P, holdMs?: number) => void;
  /** What is held for this key, without touching it. */
  peek: (key: string) => P | null;
  /** Cancel a held send. Returns its payload, or null when nothing was held. */
  undo: (key: string) => P | null;
  /** Send this payload now, replacing anything held for the key. */
  sendNow: (key: string, payload: P) => void;
  /** Send every held payload now, or only the one for `key`. */
  flush: (key?: string) => void;
  isHeld: (key: string) => boolean;
  /** Cancel everything without sending. */
  dispose: () => void;
}

export function createHeldSends<P>(options: HeldSendsOptions<P>): HeldSends<P> {
  const held = new Map<string, { payload: P; timer: ReturnType<typeof setTimeout> }>();

  const send = (key: string, payload: P) => {
    options.commit(key, payload).then(
      () => options.onCommitted?.(key, payload),
      (error) => options.onError(key, payload, error),
    );
  };

  const cancel = (key: string): P | null => {
    const entry = held.get(key);
    if (!entry) return null;
    clearTimeout(entry.timer);
    held.delete(key);
    return entry.payload;
  };

  return {
    hold(key, payload, holdMs = options.holdMs) {
      cancel(key);
      const timer = setTimeout(() => {
        held.delete(key);
        send(key, payload);
      }, holdMs);
      held.set(key, { payload, timer });
    },
    peek: (key) => held.get(key)?.payload ?? null,
    undo: cancel,
    sendNow(key, payload) {
      cancel(key);
      send(key, payload);
    },
    flush(only) {
      for (const key of only === undefined ? [...held.keys()] : [only]) {
        const payload = cancel(key);
        if (payload !== null) send(key, payload);
      }
    },
    isHeld: (key) => held.has(key),
    dispose() {
      for (const key of [...held.keys()]) cancel(key);
    },
  };
}
