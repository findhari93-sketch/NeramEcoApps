'use client';

import { Box, Divider, Paper, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import TestFolderPicker from '@/components/tests/TestFolderPicker';
import type { DraftRules, PlacementChoice, TestDraft } from '@/lib/test-wizard-draft';
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

  const rows: PlacementRowSpec[] = [
    {
      kind: 'class_test',
      title: 'Class test',
      subtitle: classroomName ? `Set for ${classroomName}, due at the time you pick` : '',
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
      subtitle: 'Appears on every student timetable at the time you set',
      disabledReason: noClassroom ? 'Choose a classroom first' : undefined,
      schedulable: true,
    },
    {
      kind: 'mock',
      title: 'Full mock',
      subtitle: 'On the mocks shelf, optionally scheduled as an exam day',
      disabledReason: noClassroom ? 'Choose a classroom first' : undefined,
      schedulable: true,
    },
    {
      kind: 'practice',
      title: 'Practice pool',
      subtitle: 'Optional self-practice, never due',
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
