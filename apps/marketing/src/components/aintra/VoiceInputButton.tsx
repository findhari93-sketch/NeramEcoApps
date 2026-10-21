'use client';

/**
 * Aintra's mic button: the shared VoiceInputButton (packages/ui/src/chat) in
 * the marketing design-system colours, with the language remembered under
 * Aintra's key and the `aintra-voice-*` test ids the E2E specs use.
 */
import SharedVoiceInputButton, { type VoiceInputButtonProps as SharedProps } from '@neram/ui/chat-voice';
import { tokens, errorColor } from '@/design-system';

export type VoiceInputButtonProps = Omit<SharedProps, 'storageKey' | 'testIdPrefix'>;

export default function VoiceInputButton({ color = tokens.navy900, ...props }: VoiceInputButtonProps) {
  return (
    <SharedVoiceInputButton
      {...props}
      color={color}
      listeningColor={errorColor}
      listeningIconColor={tokens.surface}
      storageKey="aintra_speech_lang"
      testIdPrefix="aintra-voice"
      // Above the Aintra drawer, which sits over the site's announcement bar (1450).
      menuZIndex={1460}
    />
  );
}
