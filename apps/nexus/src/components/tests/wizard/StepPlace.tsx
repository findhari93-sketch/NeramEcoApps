'use client';

import { useEffect, useId, useState } from 'react';
import {
  Box,
  Divider,
  Paper,
  Slider,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import TestFolderPicker from '@/components/tests/TestFolderPicker';
import {
  MIN_POOL_FOR_DRAW,
  SERVE_STEP,
  activeQuestions,
  clampQuestionsToServe,
  sittingsBeforeRepeat,
  type DraftRules,
  type PlacementChoice,
  type TestDraft,
} from '@/lib/test-wizard-draft';
import PlacementChecklist, { type PlacementRowSpec } from './PlacementChecklist';

/**
 * Step 4. Rules on the left, placement on the right.
 *
 * Checkpoints are deliberately NOT created here. This step can only mark them
 * required; they are authored on the class video page, because a checkpoint
 * anchors to a moment in a transcript and there is no transcript on this screen.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        py: 1.25,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Typography variant="body2">{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{children}</Box>
    </Box>
  );
}

/** The slider's stops: every SERVE_STEP up to the pool, then the pool itself, which means "all". */
function serveStops(pool: number): number[] {
  const stops: number[] = [];
  for (let v = SERVE_STEP; v < pool; v += SERVE_STEP) stops.push(v);
  stops.push(pool);
  return stops;
}

/**
 * "Each student gets". A random subset per student, drawn by the engine that
 * already exists (pickTestDraw via ensureTestDraw): the pool is shuffled once
 * per student, and attempt k takes the k-th window of N, wrapping at the end.
 * The copy below is written from that behaviour, so keep the two in step.
 */
function ServeControl({
  pool,
  serve,
  marks,
  onChange,
}: {
  pool: number;
  /** null means every question. */
  serve: number | null;
  /** Marks per question when every question carries the same, else null. */
  marks: number | null;
  onChange: (next: number | null) => void;
}) {
  const labelId = useId();
  const effective = clampQuestionsToServe(serve, pool);
  const shown = effective ?? pool;
  // The field keeps its own text while it is being typed in, so "5" on the way
  // to "50" is not clamped out from under the teacher. Committed on blur/Enter.
  const [text, setText] = useState(String(shown));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(shown));
  }, [shown, editing]);

  const commit = () => {
    setEditing(false);
    const n = Math.floor(Number(text));
    if (!Number.isFinite(n) || n <= 0) {
      setText(String(shown));
      return;
    }
    onChange(n >= pool ? null : Math.max(SERVE_STEP, n));
  };

  const stops = serveStops(pool);
  const sittings = sittingsBeforeRepeat(pool, effective);
  const leftover = effective ? pool - sittings * effective : 0;

  let explain: string;
  if (effective === null) {
    explain = `Every student gets all ${pool} questions.`;
  } else if (sittings >= 2) {
    explain =
      `Each student gets their own random ${effective}, in a random order with options shuffled. ` +
      `A retake gives the next ${effective} they haven't seen, so ${sittings} sittings can run before anything repeats.`;
  } else {
    explain =
      `Each student gets their own random ${effective}, in a random order with options shuffled. ` +
      `A retake gives them the ${pool - effective} they haven't seen, plus some they have.`;
  }

  // Scores are out of the questions a student was served (submitAttempt grades
  // the draw, not the pool), while the library lists the whole pool's total.
  const marksNote =
    effective === null
      ? null
      : marks !== null
        ? `Each sitting is marked out of ${effective * marks} (${effective} × ${marks}), and the pass mark is a share of that. The library lists the pool's full ${pool * marks}.`
        : `Each sitting is marked out of the ${effective} questions that student was served, and the pass mark is a share of that. The library lists the whole pool's total.`;

  return (
    // No border of its own: it follows the rule rows, and the last of those
    // draws the line above it.
    <Box sx={{ py: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="body2" id={labelId}>
          Each student gets
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            size="small"
            type="number"
            value={text}
            onFocus={() => setEditing(true)}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            inputProps={{
              'aria-labelledby': labelId,
              inputMode: 'numeric',
              min: SERVE_STEP,
              max: pool,
              step: SERVE_STEP,
            }}
            sx={{ width: 88, '& .MuiInputBase-input': { fontSize: 16 }, '& .MuiInputBase-root': { minHeight: 48 } }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            of {pool}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ px: 1.25, mt: 0.5 }}>
        <Slider
          value={shown}
          min={Math.min(SERVE_STEP, pool)}
          max={pool}
          step={null}
          marks={stops.map((v) => ({ value: v }))}
          onChange={(_, v) => {
            const n = Array.isArray(v) ? v[0] : v;
            onChange(n >= pool ? null : n);
          }}
          getAriaValueText={(v) => (v >= pool ? `All ${pool}` : `${v} of ${pool}`)}
          aria-labelledby={labelId}
          sx={{
            py: 2.5,
            // The stops are every 5; drawing them all turns a 300 pool into a comb.
            '& .MuiSlider-mark': { display: 'none' },
            '& .MuiSlider-thumb': { width: 24, height: 24 },
            '@media (prefers-reduced-motion: reduce)': {
              '& .MuiSlider-thumb, & .MuiSlider-track': { transition: 'none' },
            },
          }}
        />
      </Box>

      {effective !== null && (
        // One segment per sitting that can run before a repeat, then what is
        // left over. Decorative: the sentence below says the same in words.
        <Box aria-hidden sx={{ display: 'flex', gap: 0.5, height: 8, mb: 1 }}>
          {Array.from({ length: Math.min(sittings, 12) }, (_, i) => (
            <Box
              key={i}
              sx={{
                flex: effective,
                borderRadius: 1,
                bgcolor: i % 2 === 0 ? 'primary.main' : 'primary.light',
              }}
            />
          ))}
          {leftover > 0 && sittings <= 12 && (
            <Box sx={{ flex: leftover, borderRadius: 1, bgcolor: 'action.disabledBackground' }} />
          )}
        </Box>
      )}

      <Typography variant="body2" color="text.secondary" aria-live="polite">
        {explain}
      </Typography>
      {marksNote && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>
          {marksNote}
        </Typography>
      )}
    </Box>
  );
}

export default function StepPlace({
  draft,
  classroomName,
  classroomId,
  onRules,
  onTitle,
  onFolder,
  onTogglePlacement,
  onSchedulePlacement,
  authFetch,
}: {
  draft: TestDraft;
  classroomName: string | null;
  classroomId: string | null;
  onRules: (patch: Partial<DraftRules>) => void;
  onTitle: (title: string) => void;
  onFolder: (folderId: string | null, path: string[]) => void;
  onTogglePlacement: (kind: PlacementChoice['kind'], on: boolean) => void;
  onSchedulePlacement: (kind: PlacementChoice['kind'], when: string) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
}) {
  const { rules } = draft;
  const noClassroom = !classroomId;

  // A random subset only makes sense with enough questions to draw from, and
  // never for an imported paper, whose sections are shuffled in place and
  // served whole (the publish route drops a serve count for it too).
  const active = activeQuestions(draft);
  const canDraw = active.length >= MIN_POOL_FOR_DRAW && draft.source !== 'pyq';
  const firstMarks = active[0]?.marks || 1;
  const sameMarks = active.every((q) => (q.marks || 1) === firstMarks) ? firstMarks : null;

  /**
   * Each row says which of the three doors it is, and what that means for a
   * deadline and a roster.
   *
   * These rows are not all the same shape underneath: "Class test" is tied to
   * one lecture and knows who attended it, while "Weekly" and "Full mock" are
   * classroom-wide with nobody linked. A teacher had no way to tell those apart
   * from the old subtitles, which is how a paper meant as a class test ended up
   * set as a weekly slot with no roster behind it.
   */
  const rows: PlacementRowSpec[] = [
    {
      kind: 'class_test',
      title: 'Class test',
      subtitle: classroomName
        ? `Follows one class in ${classroomName}. Knows who attended, and who caught up.`
        : 'Follows one class. Knows who attended, and who caught up.',
      disabledReason: noClassroom ? 'Choose a classroom first' : undefined,
      schedulable: true,
    },
    {
      kind: 'chapter',
      title: 'Chapter (study material)',
      subtitle: 'Taken on the chapter page, after the reading',
      // A chapter placement needs a specific file, which is chosen from the
      // chapter itself. Offering a blind tick here would create a placement
      // pointing at nothing.
      disabledReason: 'Attach this from the chapter page in Study materials',
    },
    {
      kind: 'weekly',
      title: 'Weekly or monthly slot',
      subtitle: 'Set for the whole class, with no class linked. Everyone enrolled is expected.',
      disabledReason: noClassroom ? 'Choose a classroom first' : undefined,
      schedulable: true,
    },
    {
      kind: 'mock',
      title: 'Full mock',
      subtitle: 'Whole class, no class linked. Use Schedule as exam for a fixed window and ranking.',
      disabledReason: noClassroom ? 'Choose a classroom first' : undefined,
      schedulable: true,
    },
    {
      kind: 'practice',
      title: 'Practice pool',
      subtitle: 'Open to everyone, always. No deadline, no roster, unlimited retries.',
      disabledReason: noClassroom ? 'Choose a classroom first' : undefined,
    },
  ];

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.3fr)' },
        gap: 2.5,
        alignItems: 'start',
      }}
    >
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Name and rules
        </Typography>

        <TextField
          fullWidth
          size="small"
          label="Test name"
          value={draft.title}
          onChange={(e) => onTitle(e.target.value)}
          sx={{ mb: 2, '& .MuiInputBase-input': { fontSize: 16 } }}
        />

        <TestFolderPicker
          authFetch={authFetch}
          value={draft.folderId}
          pendingPath={draft.folderPath}
          onChange={onFolder}
        />

        <Divider sx={{ my: 2 }} />

        <Row label="Timed">
          <Switch checked={rules.timed} onChange={(e) => onRules({ timed: e.target.checked })} />
          {rules.timed && (
            <TextField
              size="small"
              type="number"
              value={rules.durationMinutes}
              onChange={(e) => onRules({ durationMinutes: Math.max(1, Number(e.target.value) || 0) })}
              sx={{ width: 96, '& .MuiInputBase-input': { fontSize: 16 } }}
              inputProps={{ 'aria-label': 'Minutes' }}
            />
          )}
        </Row>

        <Row label="Marks per question">
          <TextField
            size="small"
            type="number"
            value={rules.marksPerQuestion}
            onChange={(e) => onRules({ marksPerQuestion: Math.max(1, Number(e.target.value) || 1) })}
            sx={{ width: 80, '& .MuiInputBase-input': { fontSize: 16 } }}
            inputProps={{ 'aria-label': 'Marks per question' }}
          />
        </Row>

        <Row label="Attempts">
          {/* 'unlimited' rather than null as the control's value: MUI's
              ToggleButton types reject null, and the draft's null means exactly
              this, so the mapping lives here and nowhere else. */}
          <ToggleButtonGroup
            exclusive
            size="small"
            value={rules.attempts === null ? 'unlimited' : String(rules.attempts)}
            onChange={(_, v) => {
              if (v === null) return;
              onRules({ attempts: v === 'unlimited' ? null : (Number(v) as 1 | 3) });
            }}
          >
            <ToggleButton value="1" sx={{ minHeight: 48, px: 2 }}>
              1
            </ToggleButton>
            <ToggleButton value="3" sx={{ minHeight: 48, px: 2 }}>
              3
            </ToggleButton>
            <ToggleButton value="unlimited" sx={{ minHeight: 48, px: 2, textTransform: 'none' }}>
              Best counts
            </ToggleButton>
          </ToggleButtonGroup>
        </Row>

        <Row label="Pass mark">
          <TextField
            size="small"
            type="number"
            value={rules.passPct}
            onChange={(e) =>
              onRules({ passPct: Math.max(1, Math.min(100, Number(e.target.value) || 0)) })
            }
            sx={{ width: 88, '& .MuiInputBase-input': { fontSize: 16 } }}
            inputProps={{ 'aria-label': 'Pass percentage' }}
          />
          <Typography variant="body2" color="text.secondary">
            %
          </Typography>
        </Row>

        <Row label="Shuffle questions">
          <Switch checked={rules.shuffle} onChange={(e) => onRules({ shuffle: e.target.checked })} />
        </Row>

        {canDraw && (
          <ServeControl
            pool={active.length}
            serve={rules.questionsToServe ?? null}
            marks={sameMarks}
            onChange={(questionsToServe) => onRules({ questionsToServe })}
          />
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
        <PlacementChecklist
          rows={rows}
          value={draft.placements}
          onToggle={onTogglePlacement}
          onSchedule={onSchedulePlacement}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Catch-up checkpoints are authored on the class video page, from its transcript. This step never
          creates them.
        </Typography>
      </Paper>
    </Box>
  );
}
