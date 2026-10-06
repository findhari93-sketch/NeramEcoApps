import PageHeader from '@/components/PageHeader';
import MyLearningList from '@/components/tutor/my-learning/MyLearningList';

/**
 * My Learning: what a student saved from the AI Tutor.
 *
 * A static server shell (no data, nothing per request) around the client
 * list, which reads /api/my-learning with the student's token. The path is
 * gated by the `student.ai-tutor` flag (FeatureGate in the student layout),
 * and the list checks the Assistant and Question Bank flags as well.
 */
export default function MyLearningPage() {
  return (
    <>
      <PageHeader
        title="My Learning"
        subtitle="Formulas, explanations and mistakes you saved from the tutor"
        backHref="/student/question-bank"
      />
      <MyLearningList />
    </>
  );
}
