import TeamsPadApp from '@/components/answer-pad/TeamsPadApp';

/**
 * A round's full report inside Teams: a Teams window on desktop, a dialog on
 * the web, opened by "Open the full report" in the console. It signs in with
 * Teams, so it is always the teacher using the pad, never whoever the default
 * browser is signed in as. The round comes from ?session= on the address.
 */
export default function AnswerPadReportInTeamsPage() {
  return <TeamsPadApp variant="report" />;
}
