'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@neram/ui';
import type { NexusQBQuestion, NexusQBQuestionSource, QBQuestionSection } from '@neram/database';
import PaperQuestionList from './PaperQuestionList';
import PaperQuestionDetail from './PaperQuestionDetail';
import type { PaperFallback } from './QuestionEditForm';

export interface PaperWorkspaceProps {
  /** Already in paper order. Position is counted from this order, not display_order. */
  questions: NexusQBQuestion[];
  tagCounts?: Record<string, number>;
  /** The paper being viewed, for the form's Source panel. */
  paper?: PaperFallback;
  /**
   * Source rows by question id. The source row is more precise than the paper:
   * it carries that question's own session, shift and printed number. Without it
   * the Source panel falls back to the paper for every question, which is a
   * quieter version of the bug the paper fallback was added to fix.
   */
  sources?: Record<string, NexusQBQuestionSource[]>;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  onChangeSections: (questionIds: string[], section: QBQuestionSection) => Promise<void>;
}

/** Is the user typing? Then j and k are letters, not navigation. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/**
 * The master-detail shell: the list owns scanning, the pane owns editing, and
 * this owns which question is open.
 *
 * One source of truth for selection is the whole point. The two tabs this
 * replaces each kept their own idea of the current question, so correcting an
 * answer key and then editing the same question meant finding it twice.
 */
export default function PaperWorkspace({
  questions, tagCounts = {}, paper, sources, getToken, onSaved, onChangeSections,
}: PaperWorkspaceProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeIndex = useMemo(
    () => (activeId ? questions.findIndex((q) => q.id === activeId) : -1),
    [questions, activeId],
  );
  const activeQuestion = activeIndex >= 0 ? questions[activeIndex] : null;

  const step = useCallback(
    (delta: number) => {
      setActiveId((current) => {
        const i = questions.findIndex((q) => q.id === current);
        if (i < 0) return current;
        const next = i + delta;
        if (next < 0 || next >= questions.length) return current;
        return questions[next].id;
      });
    },
    [questions],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'j') { e.preventDefault(); step(1); }
      if (e.key === 'k') { e.preventDefault(); step(-1); }
      if (e.key === 'Escape') setActiveId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step]);

  const changeOne = useCallback(
    (questionId: string, section: QBQuestionSection) => onChangeSections([questionId], section),
    [onChangeSections],
  );

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', minHeight: 0 }}>
      <Box sx={{ flex: { xs: 1, md: '0 0 46%' }, minWidth: 0 }}>
        <PaperQuestionList
          questions={questions}
          tagCounts={tagCounts}
          activeQuestionId={activeId}
          onActivate={setActiveId}
          onChangeSections={onChangeSections}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: { xs: activeId ? 'block' : 'none', md: 'block' } }}>
        <PaperQuestionDetail
          question={activeQuestion}
          position={activeQuestion ? { index: activeIndex + 1, total: questions.length } : null}
          paper={paper}
          sources={activeQuestion ? sources?.[activeQuestion.id] : undefined}
          getToken={getToken}
          onSaved={onSaved}
          onClose={() => setActiveId(null)}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onChangeSection={changeOne}
        />
      </Box>
    </Box>
  );
}
