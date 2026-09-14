'use client';

/**
 * Microphone to Blob, for voice feedback.
 *
 * Owns the MediaRecorder lifecycle and nothing else: no network and no UI. The
 * component above it decides what a finished recording is for.
 *
 * Three things it is careful about:
 *  - The cap runs on a timer, not on animation frames. Frames stop when the tab
 *    is hidden, and a note would quietly run past three minutes.
 *  - If the microphone goes away mid-note (a phone call, a pulled headset), the
 *    track ends and the note stops with what was said instead of vanishing.
 *  - The microphone is released on stop, cancel and unmount, so the browser's
 *    recording indicator never stays lit after the teacher is done.
 *  - `clockStartedAt` is the moment audio actually began, on the
 *    performance.now() clock. Opening the microphone takes hundreds of ms (and
 *    seconds on a first permission prompt), so anything timed against the press
 *    of Start instead runs that far behind the voice. A sketch walkthrough used
 *    exactly that, and every stroke replayed late.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RECORDING_BITS_PER_SECOND,
  RECORDING_CAP_MS,
  pickRecordingMime,
} from '@/lib/voice-recording';

export type RecorderStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'recorded'
  | 'denied'
  | 'unsupported'
  | 'error';

export interface FinishedRecording {
  blob: Blob;
  mime: string;
  durationMs: number;
  /** Object URL for a preview. Revoked on discard and on unmount. */
  url: string;
}

const TICK_MS = 100;

export function useVoiceRecorder(capMs: number = RECORDING_CAP_MS) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState<FinishedRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clockStartedAt, setClockStartedAt] = useState<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const urlRef = useRef<string | null>(null);

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const discard = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setRecording(null);
    setElapsedMs(0);
    setClockStartedAt(null);
    setStatus('idle');
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      release();
      setElapsedMs(0);
      setStatus('idle');
    }
  }, [release]);

  const start = useCallback(async () => {
    if (
      typeof window === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setStatus('unsupported');
      return;
    }
    const mime = pickRecordingMime((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) {
      setStatus('unsupported');
      return;
    }

    discard();
    setError(null);
    setStatus('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('denied');
      } else {
        setError(
          name === 'NotFoundError'
            ? 'No microphone was found on this device.'
            : 'The microphone could not start.',
        );
        setStatus('error');
      }
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    cancelledRef.current = false;

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: RECORDING_BITS_PER_SECOND });
    } catch {
      release();
      setError('This browser could not start recording.');
      setStatus('error');
      return;
    }
    recorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const durationMs = Math.min(performance.now() - startedAtRef.current, capMs);
      release();
      recorderRef.current = null;
      if (cancelledRef.current) {
        chunksRef.current = [];
        setElapsedMs(0);
        setStatus('idle');
        return;
      }
      const type = rec.mimeType || mime;
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setElapsedMs(durationMs);
      setRecording({ blob, mime: type, durationMs, url });
      setStatus('recorded');
    };

    stream.getAudioTracks().forEach((track) => {
      track.onended = () => stop();
    });

    // Level meter. Optional: a browser without Web Audio still records.
    let sample: (() => number) | null = null;
    try {
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      const buf = new Uint8Array(analyser.fftSize);
      sample = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        return Math.min(1, peak / 64);
      };
    } catch {
      sample = null;
    }

    // The recorder's own start event is the closest the page can get to the
    // first captured sample. Set before start() so it cannot be missed; the
    // value taken just after start() stands until it arrives.
    let clockSet = false;
    rec.onstart = () => {
      if (clockSet) return;
      clockSet = true;
      const at = performance.now();
      startedAtRef.current = at;
      setClockStartedAt(at);
    };

    // A one-second timeslice, so a crash mid-note still leaves what was captured.
    rec.start(1000);
    startedAtRef.current = performance.now();
    // A browser that never fires start must not leave a walkthrough unable to
    // record strokes: fall back to the value taken after start().
    setTimeout(() => {
      if (clockSet || recorderRef.current !== rec) return;
      clockSet = true;
      setClockStartedAt(startedAtRef.current);
    }, 500);
    setElapsedMs(0);
    setStatus('recording');

    timerRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current;
      setElapsedMs(Math.min(elapsed, capMs));
      if (sample) setLevel(sample());
      if (elapsed >= capMs) stop();
    }, TICK_MS);
  }, [capMs, discard, release, stop]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          // Already stopping.
        }
      }
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return { status, elapsedMs, level, recording, error, capMs, clockStartedAt, start, stop, cancel, discard };
}
