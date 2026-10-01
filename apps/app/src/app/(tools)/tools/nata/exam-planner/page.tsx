import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import ExamPlannerDemo, { type DemoMonth } from '@/features/tools/exam-planner/ExamPlannerDemo';
import { NATA_2026_SESSIONS, buildSessionLabel, getSessionKey, groupSessionsByMonth } from '@/components/exam-planner/nata-2026-schedule';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { nataCycleYear } from '@/lib/tools/cycle';
import { MARKETING_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('nata-exam-planner');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default function ExamPlannerPage() {
  const tool = getToolSeo('nata-exam-planner');
  const months: DemoMonth[] = [...groupSessionsByMonth(NATA_2026_SESSIONS).entries()].map(([month, sessions]) => ({
    month,
    sessions: sessions.map((s) => ({ key: getSessionKey(s.date, s.timeSlot), label: buildSessionLabel(s),phase: s.phase as DemoMonth['sessions'][number]['phase'] })),
  }));

  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      demo={<ExamPlannerDemo months={months} cycleYear={nataCycleYear()} scheduleYear={2026} />}
      moreLinks={[{ href: `${MARKETING_URL}/nata-2026/how-to-apply`, label: 'How to apply for NATA' }]}
    />
  );
}
