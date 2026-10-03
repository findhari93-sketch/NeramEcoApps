import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import QuestionBankDemo from '@/features/tools/question-bank/QuestionBankDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { loadQuestionBank } from '@/lib/tools/data/loaders';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';

export const revalidate = 86400;

const LABELS: Record<string, string> = {
  mathematics: 'Mathematics',
  general_aptitude: 'General aptitude',
  drawing: 'Drawing',
  logical_reasoning: 'Logical reasoning',
  aesthetic_sensitivity: 'Aesthetic sensitivity',
  other: 'Other',
};

export function generateMetadata(): Metadata {
  const tool = getToolSeo('nata-question-bank');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default async function QuestionBankPage() {
  const tool = getToolSeo('nata-question-bank');
  const { questions, sample } = await loadQuestionBank();
  const topics = [...new Set(questions.map((q) => LABELS[q.category] ?? q.category))];

  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      answer={
        questions.length > 0
          ? `${tool.answer} It has ${questions.length} reviewed question${questions.length === 1 ? '' : 's'} so far${topics.length ? `, in ${topics.join(', ')}` : ''}.`
          : tool.answer
      }
      demoTitle="Browse the questions"
      demo={
        <QuestionBankDemo
          questions={questions.map((q) => ({ title: q.title, category: q.category, year: q.examYear }))}
          labels={LABELS}
          sample={sample ? { title: sample.title, body: sample.body } : null}
        />
      }
    />
  );
}
