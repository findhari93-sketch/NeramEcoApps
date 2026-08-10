'use client';

import { useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Paper, Select, TextField, Typography, Checkbox } from '@neram/ui';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import { QB_SECTIONS, QB_SECTION_ORDER, qbSectionLabel } from '@neram/database';
import PaperQuestionRow from './PaperQuestionRow';

export interface PaperQuestionListProps {
  questions: NexusQBQuestion[];
  tagCounts: Record<string, number>;
  activeQuestionId: string | null;
  onActivate: (questionId: string) => void;
  onChangeSections: (questionIds: string[], section: QBQuestionSection) => Promise<void>;
}

/**
 * The paper as a scannable list.
 *
 * Grouping comes from the section stored on each question, never re-derived
 * from question numbers: that guess already has one home in
 * qb-section-inference.ts, and a second copy here is how the old grid quietly
 * mislabelled papers that did not follow the current JEE numbering.
 */
export default function PaperQuestionList({
  questions,
  tagCounts,
  activeQuestionId,
  onActivate,
  onChangeSections,
}: PaperQuestionListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSection, setBulkSection] = useState<QBQuestionSection | ''>('');
  const [applying, setApplying] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  // Ranges are tracked by question number, not row index: after a bad import the
  // questions a teacher wants are scattered across groups but are always a
  // contiguous run of Q numbers.
  const anchorRef = useRef<number | null>(null);

  const toggleOne = (question: NexusQBQuestion, shiftKey: boolean) => {
    const qNum = question.display_order ?? 0;
    setSelected((prev) => {
      const next = new Set(prev);
      const anchor = anchorRef.current;
      if (shiftKey && anchor != null && anchor !== qNum) {
        const lo = Math.min(anchor, qNum);
        const hi = Math.max(anchor, qNum);
        for (const other of questions) {
          const n = other.display_order ?? 0;
          if (n >= lo && n <= hi) next.add(other.id);
        }
        return next;
      }
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
    anchorRef.current = qNum;
  };

  const selectRange = () => {
    const from = parseInt(rangeFrom, 10);
    const to = parseInt(rangeTo, 10);
    if (Number.isNaN(from) || Number.isNaN(to)) return;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    setSelected(
      new Set(
        questions
          .filter((x) => {
            const n = x.display_order ?? 0;
            return n >= lo && n <= hi;
          })
          .map((x) => x.id),
      ),
    );
    anchorRef.current = hi;
  };

  const clearSelection = () => {
    setSelected(new Set());
    anchorRef.current = null;
  };

  const applyBulkSection = async () => {
    if (!bulkSection || selected.size === 0) return;
    setApplying(true);
    try {
      await onChangeSections(Array.from(selected), bulkSection);
      clearSelection();
      setBulkSection('');
    } finally {
      setApplying(false);
    }
  };

  // Paper-order position per question, so a row whose display_order is NULL
  // still gets a distinct number. A staging drawing paper has 96 questions with
  // no display_order at all, which otherwise names every row "question 0".
  const positions = useMemo(() => {
    const map = new Map<string, number>();
    questions.forEach((item, i) => map.set(item.id, i + 1));
    return map;
  }, [questions]);

  const sections = useMemo(() => {
    const groups = new Map<string, { order: number; questions: NexusQBQuestion[] }>();
    for (const item of questions) {
      const key = item.section ?? '__none__';
      if (!groups.has(key)) {
        groups.set(key, { order: item.section ? QB_SECTION_ORDER[item.section] ?? 98 : 99, questions: [] });
      }
      groups.get(key)!.questions.push(item);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, group]) => {
        const numbers = group.questions.map((x) => x.display_order).filter((n): n is number => n != null);
        const range = numbers.length ? ` (Q${Math.min(...numbers)} to Q${Math.max(...numbers)})` : '';
        return {
          key,
          title: `${key === '__none__' ? 'Unsectioned' : qbSectionLabel(key)}${range}`,
          questions: group.questions,
        };
      });
  }, [questions]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Paper
        variant="outlined"
        sx={{ p: 1, mb: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, borderRadius: 1.5 }}
      >
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Select
        </Typography>
        <Button size="small" sx={{ minHeight: 36, textTransform: 'none' }}
          onClick={() => setSelected(new Set(questions.map((x) => x.id)))}>
          All
        </Button>
        <Button size="small" disabled={selected.size === 0} sx={{ minHeight: 36, textTransform: 'none' }}
          onClick={clearSelection}>
          None
        </Button>
        <TextField size="small" value={rangeFrom} placeholder="From"
          onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ''))}
          inputProps={{ inputMode: 'numeric', 'aria-label': 'First question number' }}
          sx={{ width: 72, '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem' } }} />
        <Typography variant="caption" color="text.secondary">to</Typography>
        <TextField size="small" value={rangeTo} placeholder="To"
          onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ''))}
          inputProps={{ inputMode: 'numeric', 'aria-label': 'Last question number' }}
          sx={{ width: 72, '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem' } }} />
        <Button size="small" variant="outlined" onClick={selectRange} disabled={!rangeFrom || !rangeTo}
          sx={{ minHeight: 36, textTransform: 'none' }}>
          Select range
        </Button>
      </Paper>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {sections.map((section) => {
          const groupIds = section.questions.map((x) => x.id);
          const groupSelected = groupIds.filter((id) => selected.has(id)).length;
          const allGroupSelected = groupSelected === groupIds.length && groupIds.length > 0;

          return (
            <Box key={section.key} sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper', py: 0.5 }}>
                <Checkbox
                  size="small"
                  checked={allGroupSelected}
                  indeterminate={groupSelected > 0 && !allGroupSelected}
                  inputProps={{ 'aria-label': `Select every question in ${section.title}` }}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (allGroupSelected) groupIds.forEach((id) => next.delete(id));
                      else groupIds.forEach((id) => next.add(id));
                      return next;
                    })
                  }
                  sx={{ p: 0.75 }}
                />
                <Typography variant="subtitle2" color="text.secondary">
                  {section.title}
                </Typography>
              </Box>

              {section.questions.map((item) => (
                <PaperQuestionRow
                  key={item.id}
                  question={item}
                  selected={selected.has(item.id)}
                  active={item.id === activeQuestionId}
                  tagCount={tagCounts[item.id] ?? 0}
                  position={positions.get(item.id)}
                  onToggleSelect={(shiftKey) => toggleOne(item, shiftKey)}
                  onActivate={() => onActivate(item.id)}
                />
              ))}
            </Box>
          );
        })}
      </Box>

      {selected.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed', left: 0, right: 0, bottom: { xs: 56, sm: 0 }, zIndex: 30,
            p: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))',
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 1,
          }}
        >
          <Typography variant="body2" fontWeight={700}>{selected.size} selected</Typography>
          <Select
            size="small"
            value={bulkSection}
            displayEmpty
            disabled={applying}
            onChange={(e) => setBulkSection(e.target.value as QBQuestionSection)}
            SelectDisplayProps={{ 'aria-label': 'Section to move the selected questions into' }}
            sx={{ minWidth: 180, minHeight: 44 }}
          >
            <MenuItem value="" disabled><em>Move to section...</em></MenuItem>
            {QB_SECTIONS.map((s) => (
              <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>{qbSectionLabel(s)}</MenuItem>
            ))}
          </Select>
          <Button variant="contained" onClick={applyBulkSection} disabled={!bulkSection || applying}
            startIcon={applying ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 44, minWidth: 100 }}>
            {applying ? 'Moving...' : 'Apply'}
          </Button>
          <Button onClick={clearSelection} disabled={applying} sx={{ textTransform: 'none', minHeight: 44 }}>
            Clear
          </Button>
        </Paper>
      )}
    </Box>
  );
}
