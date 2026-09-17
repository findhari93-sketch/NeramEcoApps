import TeamsPadApp from '@/components/answer-pad/TeamsPadApp';

/**
 * The pop-up a "Question N is open" notification shows on the meeting screen:
 * only the student's answer buttons, sized to fit without scrolling. Most
 * students answer here, on their phones, without ever opening the side panel.
 */
export default function AnswerPadPopupPage() {
  return <TeamsPadApp variant="popup" />;
}
