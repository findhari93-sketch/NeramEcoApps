import TeamsPadApp from '@/components/answer-pad/TeamsPadApp';

/**
 * What the teacher's Share results button puts on the meeting screen: the
 * class's results for the current question, the same for everyone watching.
 */
export default function AnswerPadStagePage() {
  return <TeamsPadApp variant="stage" />;
}
