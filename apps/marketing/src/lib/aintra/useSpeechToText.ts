'use client';

/**
 * useSpeechToText, a thin wrapper over the browser Web Speech API
 * (window.SpeechRecognition / webkitSpeechRecognition).
 *
 * Why the browser API: it is free, fully client-side (zero Vercel function
 * invocations and zero Gemini cost), and works well on Android Chrome and
 * desktop Chrome, which is the bulk of Neram's student traffic. On browsers
 * without support (most iOS Safari) `isSupported` is false and callers simply
 * hide the mic, no fallback server cost, no crash.
 *
 * Used by VoiceInputButton, which is dropped into every Aintra chat widget so
 * students can speak their question instead of typing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SpeechLang {
  /** BCP-47 code passed to SpeechRecognition.lang */
  code: string;
  /** Short 2-letter label shown on the picker button */
  short: string;
  /** Full name shown in the language menu (in the language's own script) */
  label: string;
}

/** The five languages the marketing site supports (matches i18n: en, ta, hi, kn, ml). */
export const SPEECH_LANGS: SpeechLang[] = [
  { code: 'en-IN', short: 'EN', label: 'English' },
  { code: 'ta-IN', short: 'TA', label: 'தமிழ்' },
  { code: 'hi-IN', short: 'HI', label: 'हिन्दी' },
  { code: 'kn-IN', short: 'KN', label: 'ಕನ್ನಡ' },
  { code: 'ml-IN', short: 'ML', label: 'മലയാളം' },
];

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type SpeechErrorKind = 'denied' | 'no-speech' | 'other';

interface UseSpeechToTextOptions {
  lang: string;
  /** Called as the user speaks. `isFinal` is true once the utterance is settled. */
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (kind: SpeechErrorKind) => void;
}

export function useSpeechToText({ lang, onResult, onError }: UseSpeechToTextOptions) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Keep callbacks in refs so start() doesn't need them in its dep array.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    setIsSupported(!!getSpeechRecognitionCtor());
  }, []);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore, recognition may already be stopped
      }
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    // Tear down any previous instance before starting a fresh one.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let transcript = '';
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        transcript += result[0]?.transcript ?? '';
        if (result.isFinal) isFinal = true;
      }
      onResultRef.current(transcript, isFinal);
    };

    rec.onerror = (event) => {
      setIsListening(false);
      const kind: SpeechErrorKind =
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'denied'
          : event.error === 'no-speech'
            ? 'no-speech'
            : 'other';
      onErrorRef.current?.(kind);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }, [lang]);

  // Clean up on unmount so a dangling recognition session doesn't keep the mic open.
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return { isSupported, isListening, start, stop };
}
