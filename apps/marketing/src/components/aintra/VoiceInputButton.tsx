'use client';

/**
 * VoiceInputButton, a mic button + compact language picker for the Aintra chat
 * input rows. Students tap the mic and speak; the transcript streams into the
 * chat input where they can edit it before sending. Powered by the browser Web
 * Speech API via useSpeechToText (free, client-side, no server cost).
 *
 * Renders nothing when the browser has no SpeechRecognition support (e.g. most
 * iOS Safari), so unsupported users just keep typing.
 *
 * Drop-in usage inside a widget's input Stack:
 *   <VoiceInputButton value={input} onChange={setInput} disabled={loading}
 *     color={primaryColor} size={40} />
 */

import { useRef, useState } from 'react';
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import MicOffIcon from '@mui/icons-material/MicOff';
import {
  SPEECH_LANGS,
  useSpeechToText,
  type SpeechErrorKind,
} from '@/lib/aintra/useSpeechToText';

const LANG_STORAGE_KEY = 'aintra_speech_lang';
const LISTENING_COLOR = '#ef4444';

function loadInitialLang(preferred?: string): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && SPEECH_LANGS.some((l) => l.code === saved)) return saved;
    } catch {
      // ignore storage errors (private mode)
    }
  }
  if (preferred && SPEECH_LANGS.some((l) => l.code === preferred)) return preferred;
  return SPEECH_LANGS[0].code;
}

export interface VoiceInputButtonProps {
  /** Current chat input text. */
  value: string;
  /** Setter for the chat input text. */
  onChange: (text: string) => void;
  disabled?: boolean;
  /** Theme color of the host widget (used for the idle mic + picker). */
  color?: string;
  /** Square button size in px; match the widget's send button. */
  size?: number;
  /** Max input length to clamp the transcript to. */
  maxLength?: number;
  /** Preferred starting language code (e.g. derived from page locale). */
  defaultLang?: string;
}

export default function VoiceInputButton({
  value,
  onChange,
  disabled = false,
  color = '#1d4ed8',
  size = 40,
  maxLength = 500,
  defaultLang,
}: VoiceInputButtonProps) {
  const [lang, setLang] = useState(() => loadInitialLang(defaultLang));
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [error, setError] = useState<SpeechErrorKind | null>(null);

  // Text already in the input when listening started; the transcript is appended to it.
  const baseTextRef = useRef('');

  const handleResult = (transcript: string, isFinal: boolean) => {
    const sep = baseTextRef.current && !baseTextRef.current.endsWith(' ') ? ' ' : '';
    const combined = (baseTextRef.current + sep + transcript).slice(0, maxLength);
    onChange(combined);
    if (isFinal) baseTextRef.current = combined;
  };

  const handleError = (kind: SpeechErrorKind) => {
    // 'no-speech' is benign (user said nothing); only surface real problems.
    if (kind !== 'no-speech') setError(kind);
  };

  const { isSupported, isListening, start, stop } = useSpeechToText({
    lang,
    onResult: handleResult,
    onError: handleError,
  });

  // Hide entirely on unsupported browsers, those users just type.
  if (!isSupported) return null;

  const currentLang = SPEECH_LANGS.find((l) => l.code === lang) ?? SPEECH_LANGS[0];

  const handleToggle = () => {
    if (isListening) {
      stop();
      return;
    }
    setError(null);
    baseTextRef.current = value;
    start();
  };

  const handlePickLang = (code: string) => {
    setLang(code);
    setMenuAnchor(null);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      // ignore storage errors
    }
  };

  const micLabel = error === 'denied'
    ? 'Microphone access blocked. Allow it in your browser settings.'
    : isListening
      ? 'Stop voice input'
      : `Speak your question (${currentLang.label})`;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {/* Language picker, compact 2-letter code that opens a menu */}
      <Tooltip title="Voice input language">
        <Box
          component="button"
          type="button"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          disabled={disabled}
          data-testid="aintra-voice-lang"
          aria-label={`Voice language: ${currentLang.label}. Tap to change.`}
          sx={{
            minWidth: 28,
            height: size,
            px: 0.5,
            border: 'none',
            background: 'none',
            cursor: disabled ? 'default' : 'pointer',
            color: color,
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            opacity: disabled ? 0.4 : 0.85,
            transition: 'opacity 150ms ease',
            '&:hover': { opacity: disabled ? 0.4 : 1 },
          }}
        >
          {currentLang.short}
        </Box>
      </Tooltip>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {SPEECH_LANGS.map((l) => (
          <MenuItem
            key={l.code}
            selected={l.code === lang}
            onClick={() => handlePickLang(l.code)}
            sx={{ fontSize: '0.875rem', minHeight: 40 }}
          >
            <Typography component="span" sx={{ fontWeight: 700, width: 28, color }}>
              {l.short}
            </Typography>
            {l.label}
          </MenuItem>
        ))}
      </Menu>

      {/* Mic / stop button */}
      <Tooltip title={micLabel} open={error === 'denied' ? true : undefined} arrow>
        <span>
          <IconButton
            onClick={handleToggle}
            disabled={disabled}
            data-testid="aintra-voice-mic"
            aria-label={micLabel}
            aria-pressed={isListening}
            sx={{
              width: size,
              height: size,
              flexShrink: 0,
              color: isListening ? '#fff' : error === 'denied' ? LISTENING_COLOR : color,
              bgcolor: isListening ? LISTENING_COLOR : 'transparent',
              transition: 'background-color 200ms ease, color 200ms ease',
              '&:hover': {
                bgcolor: isListening ? '#dc2626' : `${color}14`,
              },
              ...(isListening && {
                animation: 'aintraMicPulse 1.6s ease-out infinite',
                '@keyframes aintraMicPulse': {
                  '0%': { boxShadow: `0 0 0 0 ${LISTENING_COLOR}66` },
                  '70%': { boxShadow: `0 0 0 8px ${LISTENING_COLOR}00` },
                  '100%': { boxShadow: `0 0 0 0 ${LISTENING_COLOR}00` },
                },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }),
            }}
          >
            {error === 'denied' ? (
              <MicOffIcon sx={{ fontSize: size * 0.5 }} />
            ) : isListening ? (
              <StopIcon sx={{ fontSize: size * 0.5 }} />
            ) : (
              <MicIcon sx={{ fontSize: size * 0.5 }} />
            )}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
