import TeamsPadApp from '@/components/answer-pad/TeamsPadApp';

/**
 * The teacher console in its own Teams window, opened by Pop out in the
 * meeting side panel. A teacher on one screen shares only the window with the
 * question, keeps this one beside it, and students never see it. The session
 * comes from ?session= on the address.
 */
export default function AnswerPadConsolePage() {
  return <TeamsPadApp variant="console" />;
}
