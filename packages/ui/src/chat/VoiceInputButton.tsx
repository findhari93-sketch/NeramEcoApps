'use client';

/**
 * VoiceInputButton, a mic button + compact language picker for a chat input
 * row. Students tap the mic and speak; the transcript streams into the input
 * where they can edit it before sending. Powered by the browser Web Speech API
 * via useSpeechToText (free, client-side, no server cost). Shared by Aintra
 * (apps/marketing) and Aintra (Tools app) (apps/app).
 *
 * Renders nothing when the browser has no SpeechRecognition support (e.g. most
 * iOS Safari), so unsupported users just keep typing.
 *
 *   <VoiceInputButton value={input} onChange={setInput} disabled={loading} size={48} />
 */

import { useRef, useState } from 'react';
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography, useTheme } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import MicOffIcon from '@mui/icons-material/MicOff';
import { SPEECH_LANGS, useSpeechToText, type SpeechErrorKind } from './useSpeechToText';

function loadInitialLang(storageKey: string, preferred?: string): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(storageKey);
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
  /** Idle mic and picker colour, as a hex value. Defaults to the theme primary. */
  color?: string;
  /** Background and pulse while listening, as a hex value. Defaults to the theme error. */
  listeningColor?: string;
  /** Icon colour on the listening background. Defaults to white. */
  listeningIconColor?: string;
  /** Square button size in px; match the widget's send button. */
  size?: number;
  /** Max input length to clamp the transcript to. */
  maxLength?: number;
  /** Preferred starting language code (e.g. derived from page locale). */
  defaultLang?: string;
  /** Where the chosen language is remembered (per chat). */
  storageKey?: string;
  /** data-testid prefix: `${prefix}-mic` and `${prefix}-lang`. */
  testIdPrefix?: string;
  /** Raise the language menu above an overlay the chat sits in. */
  menuZIndex?: number;
}

export default function VoiceInputButton({
  value,
  onChange,
  disabled = false,
  color,
  listeningColor,
  listeningIconColor = '#FFFFFF',
  size = 40,
  maxLength = 500,
  defaultLang,
  storageKey = 'neram_speech_lang',
  testIdPrefix = 'voice',
  menuZIndex,
}: VoiceInputButtonProps) {
  const theme = useTheme();
  const idle = color ?? theme.palette.primary.main;
  const live = listeningColor ?? theme.palette.error.main;
  const [lang, setLang] = useState(() => loadInitialLang(storageKey, defaultLang));
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
      window.localStorage.setItem(storageKey, code);
    } catch {
      // ignore storage errors
    }
  };

  const micLabel =
    error === 'denied'
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
          data-testid={`${testIdPrefix}-lang`}
          aria-label={`Voice language: ${currentLang.label}. Tap to change.`}
          sx={{
            // 44px: a 28px target was too small to tap reliably on a phone.
            minWidth: 44,
            height: Math.max(size, 44),
            px: 0.5,
            border: 'none',
            borderRadius: 1,
            background: 'none',
            '&:focus-visible': { outline: '2px solid', outlineColor: idle, outlineOffset: -2 },
            cursor: disabled ? 'default' : 'pointer',
            color: idle,
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
        sx={menuZIndex ? { zIndex: menuZIndex } : undefined}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {SPEECH_LANGS.map((l) => (
          <MenuItem key={l.code} selected={l.code === lang} onClick={() => handlePickLang(l.code)} sx={{ fontSize: '0.875rem', minHeight: 44 }}>
            <Typography component="span" sx={{ fontWeight: 700, width: 28, color: idle }}>
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
            data-testid={`${testIdPrefix}-mic`}
            aria-label={micLabel}
            aria-pressed={isListening}
            sx={{
              width: size,
              height: size,
              flexShrink: 0,
              color: isListening ? listeningIconColor : error === 'denied' ? live : idle,
              bgcolor: isListening ? live : 'transparent',
              transition: 'background-color 200ms ease, color 200ms ease',
              '&:hover': {
                bgcolor: isListening ? live : `${idle}14`,
              },
              ...(isListening && {
                animation: 'neramMicPulse 1.6s ease-out infinite',
                '@keyframes neramMicPulse': {
                  '0%': { boxShadow: `0 0 0 0 ${live}66` },
                  '70%': { boxShadow: `0 0 0 8px ${live}00` },
                  '100%': { boxShadow: `0 0 0 0 ${live}00` },
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

export { SPEECH_LANGS, useSpeechToText };
export type { SpeechErrorKind, SpeechLang } from './useSpeechToText';
