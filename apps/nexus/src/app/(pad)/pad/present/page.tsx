import type { Metadata } from 'next';
import PresentApp from '@/components/question-bank/present/PresentApp';

export const metadata: Metadata = {
  title: 'Present to class | Neram',
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | null {
  const value = params[key];
  return typeof value === 'string' && value ? value : null;
}

/**
 * Present to class: a question bank paper (?paper=<id>) or a picked list
 * (?ids=<id>,<id>) on the shared screen, driving the Answer Pad. ?q= is the
 * question on screen, ?back= where Exit returns to.
 *
 * Read from the page's searchParams, not useSearchParams, which would need a
 * Suspense boundary to prerender.
 */
export default function PresentPage({ searchParams }: { searchParams: SearchParams }) {
  const ids = one(searchParams, 'ids')?.split(',').map((id) => id.trim()).filter(Boolean) ?? null;
  return (
    <PresentApp
      source={{
        paperId: one(searchParams, 'paper'),
        ids: ids?.length ? ids : null,
        startAt: one(searchParams, 'q'),
        back: one(searchParams, 'back'),
      }}
    />
  );
}
