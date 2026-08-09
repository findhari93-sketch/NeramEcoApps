# QB Paper Merged Questions View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Answer Key and Questions tabs on `/teacher/question-bank/papers/[id]` with one master-detail workspace where a teacher edits a whole question in one place, sees its LaTeX typeset while editing, and can see the question without scrolling.

**Architecture:** A dense one-line-per-question list on the left owns selection; a detail pane on the right renders the editor for the selected question. `InlineQuestionEditor` (776 lines, currently both row and form) splits into a row component and a form component, so the pane can host the form without the accordion machinery. A new `MathField` pairs a plain LaTeX textarea with a live KaTeX preview. Below 900px the pane becomes a full-screen sheet.

**Tech Stack:** Next.js 14 App Router, React 18, MUI v5 via `@neram/ui`, KaTeX via `components/common/MathText.tsx`, Vitest + @testing-library/react for unit tests, Playwright for E2E.

## Global Constraints

- **No em dashes (`—`), double dashes (`--`), or `&mdash;` in any user-visible string.** Use commas, colons, periods or parentheses. This applies to labels, placeholders, aria-labels, empty states and error copy.
- **Mobile-first.** Design at 375px first. Touch targets minimum 44px (`assertTouchTargetSize` asserts 44; aim for 48). No horizontal scroll at any viewport.
- **Import MUI components from `@neram/ui`,** never from `@mui/material` directly. Icons come from `@mui/icons-material`.
- **Unit tests are colocated** next to the source file as `<Name>.test.tsx`. E2E tests live in `tests/e2e/` and match `*nexus*.spec.ts`.
- **Run tests with `pnpm test:run`, never `pnpm test`** (bare `vitest` is watch mode and never exits).
- **Never deploy, push, or run `pnpm deploy:*`.** Commit only.
- **This plan touches only `apps/nexus/`.** No `packages/` changes, so no cross-app rebuild.
- Existing prop name to preserve: the paper page passes `onChangeSections(questionIds: string[], section: QBQuestionSection)` to the grid. Keep that exact signature.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `apps/nexus/src/components/common/MathField.tsx` | A labelled textarea holding LaTeX source with a live typeset preview beneath it. |
| `apps/nexus/src/components/common/MathField.test.tsx` | Tests for the above. |
| `apps/nexus/src/components/question-bank/paper/PaperQuestionRow.tsx` | One compact list row: tick box, Q number, clamped stem, type, section, answer, tag count, status. |
| `apps/nexus/src/components/question-bank/paper/PaperQuestionRow.test.tsx` | Tests for the above. |
| `apps/nexus/src/components/question-bank/paper/PaperQuestionList.tsx` | The scrollable list, grouped into section runs, owning tick-box selection, the range picker and the bulk bar. |
| `apps/nexus/src/components/question-bank/paper/PaperQuestionList.test.tsx` | Tests for the above. |
| `apps/nexus/src/components/question-bank/paper/QuestionEditForm.tsx` | The editing form for one question, extracted from `InlineQuestionEditor`. No expand/collapse: the pane owns that. |
| `apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx` | Tests for the above. |
| `apps/nexus/src/components/question-bank/paper/PaperQuestionDetail.tsx` | The detail pane: header with previous/next, the Edit tab, and the mobile full-screen sheet behaviour. |
| `apps/nexus/src/components/question-bank/paper/PaperQuestionDetail.test.tsx` | Tests for the above. |
| `apps/nexus/src/components/question-bank/paper/PaperWorkspace.tsx` | The master-detail shell. Owns which question is selected and the keyboard navigation. |
| `apps/nexus/src/components/question-bank/paper/PaperWorkspace.test.tsx` | Tests for the above. |
| `tests/e2e/nexus-qb-paper-workspace.spec.ts` | Mobile and desktop end-to-end coverage. |

**Modify:**

| File | Change |
|---|---|
| `apps/nexus/src/app/(teacher)/teacher/question-bank/papers/[id]/page.tsx` | Collapse the Answer Key and Questions tabs into one Questions tab rendering `PaperWorkspace`. Move "Upload Answer Key" to a header action. |
| `apps/nexus/src/components/question-bank/AnswerKeyGrid.tsx` | Reduced to the answer-key bulk upload entry point, or deleted if nothing else consumes it. Decided in Task 9 by grep, not by guess. |

**Leave alone:** `InlineQuestionEditor.tsx` keeps existing after the extraction only if another route still imports it. Task 4 checks.

---

### Task 1: MathField, a LaTeX textarea with a live preview

The defect: `InlineQuestionEditor` renders question text and every option as a plain `TextField`, so a maths question reads as `$c = 1$` while the list beside it renders properly. The field must keep holding LaTeX source (a WYSIWYG editor does not survive LaTeX), so the fix is a preview beneath it.

**Files:**
- Create: `apps/nexus/src/components/common/MathField.tsx`
- Test: `apps/nexus/src/components/common/MathField.test.tsx`

**Interfaces:**
- Consumes: `MathText` from `@/components/common/MathText`, props `{ text: string; variant?: 'caption' | 'body2' | ...; sx?: Record<string, unknown> }`.
- Produces:
  ```ts
  interface MathFieldProps {
    label: string;
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    minRows?: number;
    disabled?: boolean;
    /** Preview even when the value contains no math. Default false. */
    previewWhenPlain?: boolean;
  }
  export default function MathField(props: MathFieldProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// apps/nexus/src/components/common/MathField.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MathField from './MathField';

describe('MathField', () => {
  it('keeps LaTeX source in the field and typesets it in the preview', () => {
    const { container } = render(
      <MathField label="Question text" value={'If $c = 1$ then'} onChange={() => {}} />,
    );
    // The editable field still holds the raw source, because that is what saves.
    expect((screen.getByLabelText('Question text') as HTMLTextAreaElement).value).toBe(
      'If $c = 1$ then',
    );
    // The preview has typeset it.
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('reports every keystroke to the caller', () => {
    const onChange = vi.fn();
    render(<MathField label="Option A" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Option A'), { target: { value: '$x^2$' } });
    expect(onChange).toHaveBeenCalledWith('$x^2$');
  });

  it('shows no preview for text with no math, so plain rows stay short', () => {
    const { container } = render(
      <MathField label="Question text" value="Plaster of Paris is used for" onChange={() => {}} />,
    );
    expect(container.querySelector('[data-testid="math-preview"]')).toBeNull();
  });

  it('previews a malformed formula rather than hiding the problem', () => {
    const { container } = render(
      <MathField label="Question text" value={'$\\frac{1}{$'} onChange={() => {}} />,
    );
    expect(container.querySelector('[data-testid="math-preview"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test:run apps/nexus/src/components/common/MathField.test.tsx`
Expected: FAIL, `Failed to resolve import "./MathField"`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/nexus/src/components/common/MathField.tsx
'use client';

import { Box, TextField, Typography } from '@neram/ui';
import MathText from './MathText';

interface MathFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
  /** Show the preview only when the value actually contains math. Default true. */
  previewWhenPlain?: boolean;
}

/** Does this string contain a `$...$` span worth typesetting? */
function hasMath(value: string): boolean {
  return /\$[^$]*[\\^_{}=+\-/][^$]*\$?/.test(value);
}

/**
 * A LaTeX source field with its typeset result underneath.
 *
 * The field stays a plain textarea holding raw LaTeX, because that is what gets
 * saved and because a WYSIWYG editor does not survive LaTeX round trips. The
 * preview is read-only and exists so a teacher can see `\frac{1}{12}` become a
 * fraction as they type, and can spot a broken formula without saving first.
 *
 * A plain-text field renders no preview at all: repeating "Plaster of Paris is
 * used for" underneath itself would be noise, and on a 92-question paper that
 * noise is most of the page.
 */
export default function MathField({
  label,
  value,
  onChange,
  placeholder,
  minRows = 2,
  disabled,
  previewWhenPlain = false,
}: MathFieldProps) {
  const showPreview = value.trim().length > 0 && (previewWhenPlain || hasMath(value));

  return (
    <Box sx={{ mb: 1 }}>
      <TextField
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        fullWidth
        multiline
        minRows={minRows}
        size="small"
        sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
      />
      {showPreview && (
        <Box
          data-testid="math-preview"
          sx={{
            mt: 0.5,
            px: 1,
            py: 0.5,
            borderLeft: '2px solid',
            borderColor: 'primary.light',
            bgcolor: 'action.hover',
            borderRadius: 0.5,
            overflowX: 'auto',
          }}
        >
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.25 }}>
            Preview
          </Typography>
          <MathText text={value} variant="body2" />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test:run apps/nexus/src/components/common/MathField.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/common/MathField.tsx apps/nexus/src/components/common/MathField.test.tsx
git commit -m "feat(nexus): LaTeX field with a live typeset preview"
```

---

### Task 2: PaperQuestionRow, one line that stays one line

**Files:**
- Create: `apps/nexus/src/components/question-bank/paper/PaperQuestionRow.tsx`
- Test: `apps/nexus/src/components/question-bank/paper/PaperQuestionRow.test.tsx`

**Interfaces:**
- Consumes: `MathText`; `NexusQBQuestion`, `QB_QUESTION_STATUS_COLORS`, `QB_QUESTION_STATUS_LABELS`, `qbSectionLabel` from `@neram/database`.
- Produces:
  ```ts
  export interface PaperQuestionRowProps {
    question: NexusQBQuestion;
    selected: boolean;      // tick box state
    active: boolean;        // currently shown in the detail pane
    tagCount: number;
    onToggleSelect: (shiftKey: boolean) => void;
    onActivate: () => void;
  }
  export default function PaperQuestionRow(props: PaperQuestionRowProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// apps/nexus/src/components/question-bank/paper/PaperQuestionRow.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import PaperQuestionRow from './PaperQuestionRow';

function q(overrides: Partial<NexusQBQuestion> = {}): NexusQBQuestion {
  return {
    id: 'q1',
    question_text: 'If the centroid of the triangle with vertices $(3c + 2, 2, 0)$ coincides',
    question_format: 'MCQ',
    options: [{ id: 'a', text: '$c = 1$' }, { id: 'b', text: '$c = 2$' }],
    correct_answer: 'a',
    display_order: 1,
    section: 'math_mcq',
    status: 'active',
    is_active: true,
    categories: [],
    ...overrides,
  } as unknown as NexusQBQuestion;
}

describe('PaperQuestionRow', () => {
  it('typesets the stem instead of printing dollar signs', () => {
    const { container } = render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={3}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.textContent).not.toContain('$(3c');
  });

  it('shows the answer letter and the tag count', () => {
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={3}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByText('A')).not.toBeNull();
    expect(screen.getByLabelText('3 tags')).not.toBeNull();
  });

  it('marks an untagged question so the gap is visible', () => {
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={0}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('No tags')).not.toBeNull();
  });

  it('separates activating the row from ticking its box', () => {
    const onActivate = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={onActivate} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Open question 1/ }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('passes the shift key through, so a run can be selected', () => {
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={() => {}} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }), { shiftKey: true });
    expect(onToggleSelect).toHaveBeenCalledWith(true);
  });

  it('says a drawing prompt is self-assessed rather than showing a blank answer', () => {
    render(
      <PaperQuestionRow question={q({ question_format: 'DRAWING_PROMPT', correct_answer: null })}
        selected={false} active={false} tagCount={0}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByText('Self-assessed')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/PaperQuestionRow.test.tsx`
Expected: FAIL, `Failed to resolve import "./PaperQuestionRow"`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/nexus/src/components/question-bank/paper/PaperQuestionRow.tsx
'use client';

import { Box, Checkbox, Chip, Tooltip, Typography } from '@neram/ui';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import type { NexusQBQuestion } from '@neram/database';
import { QB_QUESTION_STATUS_COLORS, QB_QUESTION_STATUS_LABELS } from '@neram/database';
import MathText from '@/components/common/MathText';

export interface PaperQuestionRowProps {
  question: NexusQBQuestion;
  /** Ticked for a bulk action. */
  selected: boolean;
  /** Currently loaded in the detail pane. */
  active: boolean;
  tagCount: number;
  onToggleSelect: (shiftKey: boolean) => void;
  onActivate: () => void;
}

/**
 * One question of a paper, on one line, staying one line.
 *
 * Two independent affordances live here and must not be confused: the tick box
 * chooses a question for a bulk action, and the rest of the row opens it in the
 * detail pane. Ticking used to mean both in earlier drafts, which made it
 * impossible to select a run without the pane jumping between them.
 *
 * The stem goes through MathText because half of a JEE paper is LaTeX, and a
 * list that prints `$(3c + 2, 2, 0)$` is not a list a teacher can scan.
 */
export default function PaperQuestionRow({
  question,
  selected,
  active,
  tagCount,
  onToggleSelect,
  onActivate,
}: PaperQuestionRowProps) {
  const qNum = question.display_order ?? 0;
  const isDrawing = question.question_format === 'DRAWING_PROMPT';
  const answer = question.correct_answer;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: active ? 'primary.50' : selected ? 'action.selected' : 'transparent',
        borderLeft: '3px solid',
        borderLeftColor: active ? 'primary.main' : 'transparent',
      }}
    >
      <Checkbox
        size="small"
        checked={selected}
        onClick={(e) => onToggleSelect((e as React.MouseEvent).shiftKey)}
        inputProps={{ 'aria-label': `Select question ${qNum}` }}
        sx={{ p: 1 }}
      />

      <Box
        role="button"
        tabIndex={0}
        aria-label={`Open question ${qNum}`}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          minHeight: 44,
          py: 0.5,
        }}
      >
        <Typography variant="body2" fontWeight={700} sx={{ minWidth: 32, flexShrink: 0 }}>
          {qNum}
        </Typography>

        <MathText
          text={question.question_text || '(no text)'}
          variant="caption"
          sx={{
            flex: 1,
            minWidth: 0,
            color: 'text.secondary',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        />

        <Box sx={{ flexShrink: 0, width: 64, textAlign: 'center' }}>
          {isDrawing ? (
            <Typography variant="caption" color="text.disabled">
              Self-assessed
            </Typography>
          ) : answer ? (
            <Typography variant="caption" fontWeight={700}>
              {answer.toUpperCase()}
            </Typography>
          ) : (
            <Typography variant="caption" color="warning.main">
              No answer
            </Typography>
          )}
        </Box>

        <Tooltip title={tagCount > 0 ? `${tagCount} tags` : 'No tags'} arrow>
          <Box
            aria-label={tagCount > 0 ? `${tagCount} tags` : 'No tags'}
            sx={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              width: 40,
              color: tagCount > 0 ? 'text.secondary' : 'warning.main',
            }}
          >
            <LocalOfferOutlinedIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption">{tagCount}</Typography>
          </Box>
        </Tooltip>

        <Chip
          label={QB_QUESTION_STATUS_LABELS[question.status] || question.status}
          size="small"
          sx={{
            flexShrink: 0,
            bgcolor: QB_QUESTION_STATUS_COLORS[question.status] + '20',
            color: QB_QUESTION_STATUS_COLORS[question.status],
            fontWeight: 600,
            fontSize: '0.65rem',
            height: 20,
          }}
        />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/PaperQuestionRow.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/question-bank/paper/PaperQuestionRow.tsx apps/nexus/src/components/question-bank/paper/PaperQuestionRow.test.tsx
git commit -m "feat(nexus): compact one-line paper question row"
```

---

### Task 3: PaperQuestionList, section runs and bulk selection

Port the selection behaviour that currently lives in `AnswerKeyGrid.tsx`: tick boxes, shift-click range by question number, a per-section-group tick box, the `Q__ to Q__` range picker, and the fixed bulk bar. Read that file before starting; the logic is proven and should move rather than be reinvented.

**Files:**
- Create: `apps/nexus/src/components/question-bank/paper/PaperQuestionList.tsx`
- Test: `apps/nexus/src/components/question-bank/paper/PaperQuestionList.test.tsx`
- Read for reference: `apps/nexus/src/components/question-bank/AnswerKeyGrid.tsx:217-300` (selection state and handlers), `:440-520` (toolbar and group headers), `:790-860` (bulk bar)

**Interfaces:**
- Consumes: `PaperQuestionRow` from Task 2; `QB_SECTIONS`, `QB_SECTION_ORDER`, `qbSectionLabel`, `QBQuestionSection` from `@neram/database`.
- Produces:
  ```ts
  export interface PaperQuestionListProps {
    questions: NexusQBQuestion[];
    tagCounts: Record<string, number>;     // question id -> count
    activeQuestionId: string | null;
    onActivate: (questionId: string) => void;
    onChangeSections: (questionIds: string[], section: QBQuestionSection) => Promise<void>;
  }
  export default function PaperQuestionList(props: PaperQuestionListProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// apps/nexus/src/components/question-bank/paper/PaperQuestionList.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import PaperQuestionList from './PaperQuestionList';

function q(n: number, section: QBQuestionSection): NexusQBQuestion {
  return {
    id: `q${n}`,
    question_text: `Question ${n}`,
    question_format: 'MCQ',
    options: [{ id: 'a', text: 'A' }],
    correct_answer: 'a',
    display_order: n,
    section,
    status: 'active',
    is_active: true,
    categories: [],
  } as unknown as NexusQBQuestion;
}

const MATHS = [1, 2, 3].map((n) => q(n, 'math_mcq'));
const APT = [4, 5, 6].map((n) => q(n, 'aptitude'));
const ALL = [...MATHS, ...APT];

describe('PaperQuestionList', () => {
  let onChangeSections: ReturnType<typeof vi.fn<[string[], QBQuestionSection], Promise<void>>>;

  beforeEach(() => {
    onChangeSections = vi.fn<[string[], QBQuestionSection], Promise<void>>().mockResolvedValue(undefined);
  });

  const renderList = (activeId: string | null = null, onActivate = vi.fn()) =>
    render(
      <PaperQuestionList
        questions={ALL}
        tagCounts={{}}
        activeQuestionId={activeId}
        onActivate={onActivate}
        onChangeSections={onChangeSections}
      />,
    );

  it('groups the paper into its section runs with the question range in the heading', () => {
    renderList();
    expect(screen.getByText('Mathematics (MCQ) (Q1 to Q3)')).not.toBeNull();
    expect(screen.getByText('Aptitude (Q4 to Q6)')).not.toBeNull();
  });

  it('opens a question in the pane without ticking it', () => {
    const onActivate = vi.fn();
    renderList(null, onActivate);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 2' }));
    expect(onActivate).toHaveBeenCalledWith('q2');
    expect(screen.queryByText('1 selected')).toBeNull();
  });

  it('moves every ticked question in one call', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 3' }));

    fireEvent.mouseDown(screen.getByLabelText('Section to move the selected questions into'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Aptitude'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onChangeSections).toHaveBeenCalledTimes(1);
    expect(onChangeSections).toHaveBeenCalledWith(['q1', 'q3'], 'aptitude');
  });

  it('shift-click fills in the run between two ticks', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 5' }), { shiftKey: true });
    expect(screen.getByText('4 selected')).not.toBeNull();
  });

  it('selects a run by question number', () => {
    renderList();
    fireEvent.change(screen.getByLabelText('First question number'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Last question number'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select range' }));
    expect(screen.getByText('4 selected')).not.toBeNull();
  });

  it('ticks a whole section group from its heading', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: /Select every question in Aptitude/i }));
    expect(screen.getByText('3 selected')).not.toBeNull();
  });

  it('clears the selection after a successful move, so the bar does not linger', async () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.mouseDown(screen.getByLabelText('Section to move the selected questions into'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Aptitude'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByText('Mathematics (MCQ) (Q1 to Q3)');
    expect(screen.queryByText('1 selected')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/PaperQuestionList.test.tsx`
Expected: FAIL, `Failed to resolve import "./PaperQuestionList"`.

- [ ] **Step 3: Write the implementation**

Port from `AnswerKeyGrid.tsx`. The selection state, `toggleOne`, `selectRange`, `applyBulkSection` and the section grouping `useMemo` move across unchanged. Render `PaperQuestionRow` per question instead of a table row, and drop the answer `Select`, the per-row `SectionSelect` and the desktop/mobile split (the row is the same at every width; the pane is what changes).

```tsx
// apps/nexus/src/components/question-bank/paper/PaperQuestionList.tsx
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/PaperQuestionList.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/question-bank/paper/PaperQuestionList.tsx apps/nexus/src/components/question-bank/paper/PaperQuestionList.test.tsx
git commit -m "feat(nexus): paper question list with section runs and bulk selection"
```

---

### Task 4: Extract QuestionEditForm from InlineQuestionEditor

A pure extraction. Behaviour must not change; the tests written here pin the behaviour that exists today so Task 5 can compact it safely.

**Files:**
- Create: `apps/nexus/src/components/question-bank/paper/QuestionEditForm.tsx`
- Test: `apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx`
- Read: `apps/nexus/src/components/question-bank/InlineQuestionEditor.tsx` in full

**What moves:** `FormData`, `createDefaultOption`, `getInitialFormData`, `buildSubmitPayload`, all the `useCallback` handlers (`updateField`, `handleOptionTextChange`, `handleOptionTextHiChange`, `handleOptionImageChange`, `addOption`, `removeOption`, `toggleCategory`), `handleSave`, and the expanded body from line 418 to the end of the Solution accordion.

**What does not move:** the collapsed row (lines 305 to 382) and `onToggle`. `PaperQuestionRow` and `PaperQuestionDetail` own those now.

**Interfaces:**
- Consumes: `NexusQBQuestion`, `NexusQBQuestionSource`, `QBDifficulty`, `QBExamRelevance`, `QBQuestionFormat` from `@neram/database`.
- Produces:
  ```ts
  export interface QuestionEditFormProps {
    question: NexusQBQuestion;
    sources?: NexusQBQuestionSource[];
    getToken: () => Promise<string | null>;
    onSaved: () => void;
    onCancel: () => void;
  }
  export default function QuestionEditForm(props: QuestionEditFormProps): JSX.Element
  ```
  It saves via `PATCH /api/question-bank/questions/{id}` with the body produced by `buildSubmitPayload`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import QuestionEditForm from './QuestionEditForm';

const question = {
  id: 'q1',
  question_text: 'If $c = 1$ then',
  question_text_hi: null,
  question_format: 'MCQ',
  options: [
    { id: 'a', text: '$c = 1$' },
    { id: 'b', text: '$c = 2$' },
  ],
  correct_answer: 'a',
  categories: ['algebra'],
  difficulty: 'MEDIUM',
  exam_relevance: 'BOTH',
  display_order: 1,
  section: 'math_mcq',
  status: 'active',
  is_active: true,
} as unknown as NexusQBQuestion;

describe('QuestionEditForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const getToken = async () => 'token';

  it('loads the question into the form', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect((screen.getByLabelText('Question text') as HTMLTextAreaElement).value).toBe('If $c = 1$ then');
  });

  it('saves an edited stem to the question endpoint', async () => {
    const onSaved = vi.fn();
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={onSaved} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'If $c = 5$ then' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/question-bank/questions/q1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body).question_text).toBe('If $c = 5$ then');
  });

  it('keeps Save disabled until something changes, so a stray click cannot rewrite a question', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: /Save/ })).toHaveProperty('disabled', true);
  });

  it('sends the chosen option id as the correct answer', async () => {
    const onSaved = vi.fn();
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={onSaved} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /Mark option B correct/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body).correct_answer).toBe('b');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx`
Expected: FAIL, `Failed to resolve import "./QuestionEditForm"`.

- [ ] **Step 3: Do the extraction**

Copy `InlineQuestionEditor.tsx` to `paper/QuestionEditForm.tsx`. Then in the copy:

1. Change the props interface to `QuestionEditFormProps` above. Delete `expanded`, `onToggle` and `index`; add `onCancel`.
2. Delete the collapsed-view return (the block starting `// Collapsed view`) and the header row that renders the expand chevron.
3. Change the reset effect so it no longer keys off `expanded`:
   ```tsx
   useEffect(() => {
     setForm(getInitialFormData(question, sources));
     setDirty(false);
     setOptionImagesEnabled(question.options?.some((o) => !!o.image_url) ?? false);
   }, [question, sources]);
   ```
4. Change `handleCancel` to call `onCancel()` instead of `onToggle()`.
5. Change the keyboard effect to drop the `if (!expanded) return;` guard.
6. Give the question text field `label="Question text"` and each option radio `inputProps={{ 'aria-label': \`Mark option ${opt.id.toUpperCase()} correct\` }}`, so the form is reachable by role in tests and by screen readers in production.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/question-bank/paper/QuestionEditForm.tsx apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx
git commit -m "refactor(nexus): extract QuestionEditForm from InlineQuestionEditor"
```

---

### Task 5: Make a question fit one screen

The editor stacks a question field, a Hindi field, a 130px image dropzone, then four options each with their own Hindi field, then three accordions: roughly 900px before Classification. Recover the space without hiding anything a teacher needs.

**Files:**
- Modify: `apps/nexus/src/components/question-bank/paper/QuestionEditForm.tsx`
- Test: `apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx` (add cases)

**Interfaces:**
- Consumes: `MathField` from Task 1; `questionNeedsImage` exported from `@/components/question-bank/AnswerKeyGrid`.
- Produces: no signature change.

- [ ] **Step 1: Write the failing tests**

Append to `QuestionEditForm.test.tsx`:

```tsx
describe('QuestionEditForm compactness', () => {
  const getToken = async () => 'token';

  it('hides the Hindi fields behind a toggle, since they are empty on most papers', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.queryByLabelText('Question text (Hindi)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Add Hindi/i }));
    expect(screen.getByLabelText('Question text (Hindi)')).not.toBeNull();
  });

  it('shows the Hindi fields straight away when the question already has Hindi', () => {
    const hindi = { ...question, question_text_hi: 'हिंदी' } as NexusQBQuestion;
    render(<QuestionEditForm question={hindi} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText('Question text (Hindi)')).not.toBeNull();
  });

  it('collapses the image dropzone to a button when the question needs no image', () => {
    render(<QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.queryByText('Paste or drop question image')).toBeNull();
    expect(screen.getByRole('button', { name: /Add image/i })).not.toBeNull();
  });

  it('opens the dropzone for a question that references a figure', () => {
    const figure = { ...question, question_text: 'Which one of the answer figures shown below' } as NexusQBQuestion;
    render(<QuestionEditForm question={figure} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Paste or drop question image')).not.toBeNull();
  });

  it('typesets the stem and each option while editing', () => {
    const { container } = render(
      <QuestionEditForm question={question} getToken={getToken} onSaved={() => {}} onCancel={() => {}} />,
    );
    expect(container.querySelectorAll('[data-testid="math-preview"]').length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx`
Expected: FAIL on the four new cases.

- [ ] **Step 3: Implement the four changes**

1. **Hindi behind a toggle.** Add state seeded from the question, so a paper that has Hindi never hides it:

```tsx
const [showHindi, setShowHindi] = useState(
  () => Boolean(question.question_text_hi) || (question.options ?? []).some((o) => o.text_hi),
);
```

Wrap every `*_hi` field in `{showHindi && ...}`, and add above the question field:

```tsx
{!showHindi && (
  <Button size="small" onClick={() => setShowHindi(true)} sx={{ textTransform: 'none', minHeight: 36 }}>
    Add Hindi
  </Button>
)}
```

2. **Image dropzone as a strip.** Reuse the existing helper rather than a second copy of the keyword list:

```tsx
import { questionNeedsImage } from '@/components/question-bank/AnswerKeyGrid';

const [showImageZone, setShowImageZone] = useState(
  () => Boolean(question.question_image_url) || questionNeedsImage(question),
);
```

Render the dropzone only when `showImageZone`; otherwise render a `Button` labelled `Add image` that sets it true.

3. **Options as a compact grid.** Replace the per-option stacked `Box` with one row: radio, text field, delete button, and the Hindi field only when `showHindi`.

```tsx
<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
  <Radio
    size="small"
    checked={form.correct_option_id === opt.id}
    onChange={() => updateField('correct_option_id', opt.id)}
    inputProps={{ 'aria-label': `Mark option ${opt.id.toUpperCase()} correct` }}
    sx={{ p: 1 }}
  />
  <Box sx={{ flex: 1, minWidth: 0 }}>
    <MathField
      label={`Option ${opt.id.toUpperCase()}`}
      value={opt.text ?? ''}
      onChange={(next) => handleOptionTextChange(opt.id, next)}
      minRows={1}
    />
    {showHindi && (
      <TextField
        label={`Option ${opt.id.toUpperCase()} (Hindi)`}
        value={opt.text_hi ?? ''}
        onChange={(e) => handleOptionTextHiChange(opt.id, e.target.value)}
        fullWidth
        size="small"
      />
    )}
  </Box>
  <IconButton aria-label={`Remove option ${opt.id.toUpperCase()}`} onClick={() => removeOption(opt.id)} sx={{ p: 1 }}>
    <DeleteOutlineIcon fontSize="small" />
  </IconButton>
</Box>
```

4. **Swap the stem and explanation fields to `MathField`,** keeping `label="Question text"`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/question-bank/paper/QuestionEditForm.tsx apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx
git commit -m "feat(nexus): compact the question editor and typeset while editing"
```

---

### Task 6: Move the section control into the form

Merging the tabs is only real if the form edits everything the Answer Key tab could. The Answer Key owned the section select; the form does not have one.

**Files:**
- Modify: `apps/nexus/src/components/question-bank/paper/QuestionEditForm.tsx`
- Test: `apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx` (add cases)

**Interfaces:**
- Produces: `QuestionEditFormProps` gains `onChangeSection?: (questionId: string, section: QBQuestionSection) => Promise<void>`. Omitted means the control is hidden.

**Why a separate callback rather than a form field:** section writes go to `PATCH /api/question-bank/papers/[id]/sections`, not the question endpoint, and they save immediately. Folding it into the form's dirty state would let Save rewrite a section a teacher only looked at.

- [ ] **Step 1: Write the failing test**

```tsx
it('saves a section change immediately, on its own endpoint', async () => {
  const onChangeSection = vi.fn().mockResolvedValue(undefined);
  render(
    <QuestionEditForm question={question} getToken={async () => 'token'}
      onSaved={() => {}} onCancel={() => {}} onChangeSection={onChangeSection} />,
  );
  fireEvent.mouseDown(screen.getByLabelText('Section for question 1'));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Aptitude'));
  await waitFor(() => expect(onChangeSection).toHaveBeenCalledWith('q1', 'aptitude'));
  // and it did not join the form's dirty state
  expect(screen.getByRole('button', { name: /Save/ })).toHaveProperty('disabled', true);
});

it('hides the section control when the caller does not offer one', () => {
  render(<QuestionEditForm question={question} getToken={async () => 'token'} onSaved={() => {}} onCancel={() => {}} />);
  expect(screen.queryByLabelText('Section for question 1')).toBeNull();
});
```

Add `within` to the import from `@testing-library/react`.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx`
Expected: FAIL, `Unable to find a label with the text of: Section for question 1`.

- [ ] **Step 3: Implement**

```tsx
{onChangeSection && (
  <Select
    size="small"
    value={question.section ?? ''}
    displayEmpty
    disabled={sectionSaving}
    SelectDisplayProps={{ 'aria-label': `Section for question ${question.display_order ?? 0}` }}
    onChange={async (e) => {
      setSectionSaving(true);
      try {
        await onChangeSection(question.id, e.target.value as QBQuestionSection);
      } finally {
        setSectionSaving(false);
      }
    }}
    sx={{ minWidth: 180, minHeight: 44 }}
  >
    <MenuItem value="" disabled><em>Unsectioned</em></MenuItem>
    {QB_SECTIONS.map((s) => (
      <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>{qbSectionLabel(s)}</MenuItem>
    ))}
  </Select>
)}
```

with `const [sectionSaving, setSectionSaving] = useState(false);` alongside the other state.

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/question-bank/paper/QuestionEditForm.tsx apps/nexus/src/components/question-bank/paper/QuestionEditForm.test.tsx
git commit -m "feat(nexus): edit a question's section from the question form"
```

---

### Task 7: PaperQuestionDetail, the pane

**Files:**
- Create: `apps/nexus/src/components/question-bank/paper/PaperQuestionDetail.tsx`
- Test: `apps/nexus/src/components/question-bank/paper/PaperQuestionDetail.test.tsx`

**Interfaces:**
- Consumes: `QuestionEditForm` from Tasks 4 to 6.
- Produces:
  ```ts
  export interface PaperQuestionDetailProps {
    question: NexusQBQuestion | null;
    position: { index: number; total: number } | null;  // 1-based index
    getToken: () => Promise<string | null>;
    onSaved: () => void;
    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onChangeSection: (questionId: string, section: QBQuestionSection) => Promise<void>;
  }
  export default function PaperQuestionDetail(props: PaperQuestionDetailProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// apps/nexus/src/components/question-bank/paper/PaperQuestionDetail.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import PaperQuestionDetail from './PaperQuestionDetail';

const question = {
  id: 'q4', question_text: 'The mean deviation of an ungrouped data is 10',
  question_format: 'MCQ', options: [{ id: 'a', text: '10.4' }],
  correct_answer: 'a', display_order: 4, section: 'math_mcq',
  status: 'active', is_active: true, categories: [],
} as unknown as NexusQBQuestion;

const base = {
  getToken: async () => 'token',
  onSaved: () => {},
  onClose: () => {},
  onChangeSection: async () => {},
};

describe('PaperQuestionDetail', () => {
  it('invites the teacher to pick a question when none is open', () => {
    render(<PaperQuestionDetail {...base} question={null} position={null}
      onPrevious={() => {}} onNext={() => {}} />);
    expect(screen.getByText('Select a question to edit it')).not.toBeNull();
  });

  it('says where you are in the paper', () => {
    render(<PaperQuestionDetail {...base} question={question} position={{ index: 4, total: 92 }}
      onPrevious={() => {}} onNext={() => {}} />);
    expect(screen.getByText('4 of 92')).not.toBeNull();
  });

  it('moves with the previous and next buttons', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(<PaperQuestionDetail {...base} question={question} position={{ index: 4, total: 92 }}
      onPrevious={onPrevious} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('stops at the ends rather than wrapping round', () => {
    render(<PaperQuestionDetail {...base} question={question} position={{ index: 1, total: 92 }}
      onPrevious={() => {}} onNext={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous question' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Next question' })).toHaveProperty('disabled', false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/PaperQuestionDetail.test.tsx`
Expected: FAIL, `Failed to resolve import "./PaperQuestionDetail"`.

- [ ] **Step 3: Implement**

```tsx
'use client';

import { Box, IconButton, Paper, Typography, useMediaQuery, useTheme } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import QuestionEditForm from './QuestionEditForm';

export interface PaperQuestionDetailProps {
  question: NexusQBQuestion | null;
  position: { index: number; total: number } | null;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onChangeSection: (questionId: string, section: QBQuestionSection) => Promise<void>;
}

/**
 * One question, filling the pane.
 *
 * Below md this is a full-screen sheet rather than a column: a two-pane split at
 * 375px gives each side about 180px, which is narrower than a single option of a
 * maths question.
 */
export default function PaperQuestionDetail({
  question, position, getToken, onSaved, onClose, onPrevious, onNext, onChangeSection,
}: PaperQuestionDetailProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (!question || !position) {
    return (
      <Paper variant="outlined" sx={{ p: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Select a question to edit it
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      variant={isMobile ? 'elevation' : 'outlined'}
      elevation={isMobile ? 16 : 0}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...(isMobile
          ? { position: 'fixed', inset: 0, zIndex: theme.zIndex.modal, borderRadius: 0 }
          : { height: '100%', position: 'sticky', top: 16 }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <IconButton aria-label="Previous question" disabled={position.index <= 1} onClick={onPrevious} sx={{ p: 1 }}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="body2" fontWeight={700}>
          {position.index} of {position.total}
        </Typography>
        <IconButton aria-label="Next question" disabled={position.index >= position.total} onClick={onNext} sx={{ p: 1 }}>
          <ChevronRightIcon />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <IconButton aria-label="Close question" onClick={onClose} sx={{ p: 1 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 1.5, md: 2 } }}>
        <QuestionEditForm
          key={question.id}
          question={question}
          getToken={getToken}
          onSaved={onSaved}
          onCancel={onClose}
          onChangeSection={onChangeSection}
        />
      </Box>
    </Paper>
  );
}
```

The `key={question.id}` is load-bearing: it remounts the form when the teacher moves to another question, so no edit can leak across.

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/PaperQuestionDetail.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/question-bank/paper/PaperQuestionDetail.tsx apps/nexus/src/components/question-bank/paper/PaperQuestionDetail.test.tsx
git commit -m "feat(nexus): paper question detail pane with paper-order navigation"
```

---

### Task 8: PaperWorkspace, the shell

**Files:**
- Create: `apps/nexus/src/components/question-bank/paper/PaperWorkspace.tsx`
- Test: `apps/nexus/src/components/question-bank/paper/PaperWorkspace.test.tsx`

**Interfaces:**
- Consumes: `PaperQuestionList` (Task 3), `PaperQuestionDetail` (Task 7).
- Produces:
  ```ts
  export interface PaperWorkspaceProps {
    questions: NexusQBQuestion[];        // already in paper order
    tagCounts?: Record<string, number>;
    getToken: () => Promise<string | null>;
    onSaved: () => void;
    onChangeSections: (questionIds: string[], section: QBQuestionSection) => Promise<void>;
  }
  export default function PaperWorkspace(props: PaperWorkspaceProps): JSX.Element
  ```
  Single-question section changes call `onChangeSections([id], section)`, so the page keeps one handler.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/nexus/src/components/question-bank/paper/PaperWorkspace.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import PaperWorkspace from './PaperWorkspace';

const questions = [1, 2, 3].map((n) => ({
  id: `q${n}`, question_text: `Question ${n}`, question_format: 'MCQ',
  options: [{ id: 'a', text: 'A' }], correct_answer: 'a', display_order: n,
  section: 'math_mcq', status: 'active', is_active: true, categories: [],
})) as unknown as NexusQBQuestion[];

const base = {
  questions,
  getToken: async () => 'token',
  onSaved: () => {},
  onChangeSections: vi.fn().mockResolvedValue(undefined),
};

describe('PaperWorkspace', () => {
  it('opens with nothing selected, so the teacher sees the whole paper first', () => {
    render(<PaperWorkspace {...base} />);
    expect(screen.getByText('Select a question to edit it')).not.toBeNull();
  });

  it('loads a clicked question into the pane', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 2' }));
    expect(screen.getByText('2 of 3')).not.toBeNull();
  });

  it('walks the paper with j and k', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByText('2 of 3')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByText('1 of 3')).not.toBeNull();
  });

  it('ignores j and k while the teacher is typing in a field', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    const field = screen.getByLabelText('Question text');
    field.focus();
    fireEvent.keyDown(field, { key: 'j' });
    expect(screen.getByText('1 of 3')).not.toBeNull();
  });

  it('closes the pane on Escape', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Select a question to edit it')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/PaperWorkspace.test.tsx`
Expected: FAIL, `Failed to resolve import "./PaperWorkspace"`.

- [ ] **Step 3: Implement**

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@neram/ui';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import PaperQuestionList from './PaperQuestionList';
import PaperQuestionDetail from './PaperQuestionDetail';

export interface PaperWorkspaceProps {
  questions: NexusQBQuestion[];
  tagCounts?: Record<string, number>;
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

export default function PaperWorkspace({
  questions, tagCounts = {}, getToken, onSaved, onChangeSections,
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
```

Note the position counts **paper order**, not the question's `display_order`, so "4 of 92" stays honest on a paper with gaps in its numbering.

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm test:run apps/nexus/src/components/question-bank/paper/PaperWorkspace.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/question-bank/paper/PaperWorkspace.tsx apps/nexus/src/components/question-bank/paper/PaperWorkspace.test.tsx
git commit -m "feat(nexus): master-detail paper workspace shell"
```

---

### Task 9: Swap the tabs on the paper page

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/question-bank/papers/[id]/page.tsx`
- Test: manual plus the E2E in Task 10

- [ ] **Step 1: Find out what still uses the old components**

```bash
grep -rn "AnswerKeyGrid\|InlineQuestionEditor" apps/nexus/src --include=*.tsx --include=*.ts | grep -v "\.test\."
```

Record the result. If the paper page is the only consumer of `InlineQuestionEditor`, delete it in Step 4. If `AnswerKeyGrid` is only used for `questionNeedsImage` and `questionMissingImages`, move those two helpers to `apps/nexus/src/components/question-bank/paper/question-images.ts` and update the importers, including `QuestionEditForm` from Task 5.

- [ ] **Step 2: Replace the two tabs with one**

Change the `Tabs` block so it reads:

```tsx
<Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
  variant="scrollable" scrollButtons="auto">
  <Tab label={`Questions (${questions.length})`} />
  <Tab label={`Bulk Images${missingAnyImageCount > 0 ? ` (${missingAnyImageCount})` : ''}`}
    icon={<CollectionsOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" sx={{ minHeight: 48 }} />
  <Tab label="Student access" icon={<GroupsOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" sx={{ minHeight: 48 }} />
</Tabs>

{tab === 0 && (
  <PaperWorkspace
    questions={questions}
    getToken={getToken}
    onSaved={() => fetchData(true)}
    onChangeSections={handleChangeSections}
  />
)}
{tab === 1 && (
  <BulkImageManager questions={questions} paperId={paperId} getToken={getToken}
    onQuestionsUpdated={() => fetchData(true)} />
)}
{tab === 2 && <PaperStudentAccessPanel paperId={paperId} getToken={getToken} refreshKey={total} />}
```

Delete the old `tab === 1` inline-editor block and the `expandedQuestionId` state that fed it.

- [ ] **Step 3: Keep the answer-key upload reachable**

`AnswerKeyUpload` was launched from inside `AnswerKeyGrid`. Add it to the paper page's action row, beside "Paste Video Links", with its existing props:

```tsx
<Button variant="outlined" size="small" startIcon={<UploadFileIcon />} onClick={() => setAnswerKeyOpen(true)}>
  Upload Answer Key
</Button>
...
<AnswerKeyUpload open={answerKeyOpen} onClose={() => setAnswerKeyOpen(false)}
  questions={questions} onApply={handleSaveAnswers} />
```

with `const [answerKeyOpen, setAnswerKeyOpen] = useState(false);`.

- [ ] **Step 4: Delete what Step 1 proved is dead, then verify**

```bash
npx tsc --noEmit -p apps/nexus/tsconfig.json
cd apps/nexus && npx next lint --file "src/app/(teacher)/teacher/question-bank/papers/[id]/page.tsx"
```

Expected: no errors, no warnings. A `TS2307` here means Step 4 deleted a file something still imports; restore it and re-check Step 1.

- [ ] **Step 5: Run the whole nexus suite**

Run: `pnpm test:run apps/nexus/src`
Expected: PASS. `ClassAttendancePanel.test.tsx` is a known flake under full-suite load; re-run it alone to confirm before blaming this change.

- [ ] **Step 6: Commit**

```bash
git add -A apps/nexus/src
git commit -m "feat(nexus): one Questions tab replacing Answer Key and Questions"
```

---

### Task 10: End-to-end coverage

**Files:**
- Create: `tests/e2e/nexus-qb-paper-workspace.spec.ts`

**Interfaces:**
- Consumes: `TEACHER_ACCOUNT`, `APP_URLS`, `injectAuthForPage` from `tests/utils/credentials`; `assertNoHorizontalOverflow`, `assertTouchTargetSize` from `tests/utils/mobile-helpers`.

Read `tests/utils/credentials.ts` before writing: never hardcode credentials, and never invent a paper id. Discover one by opening the papers list and clicking the first card.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/nexus-qb-paper-workspace.spec.ts
import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

test.describe('QB paper workspace', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${APP_URLS.nexus}/teacher/question-bank/papers`);
    await page.getByRole('link', { name: /JEE|NATA/ }).first().click();
    await expect(page.getByRole('tab', { name: /Questions \(/ })).toBeVisible();
  });

  test('AC1: Answer Key is gone and Questions is the only editing tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Answer Key' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Questions \(/ })).toBeVisible();
  });

  test('AC2: opening a question loads it into the pane', async ({ page }) => {
    await page.getByRole('button', { name: /^Open question / }).first().click();
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
    await expect(page.getByLabel('Question text')).toBeVisible();
  });

  test('AC3: LaTeX is typeset in the list and previewed in the editor', async ({ page }) => {
    await expect(page.locator('.katex').first()).toBeVisible();
    await page.getByRole('button', { name: /^Open question / }).first().click();
    const field = page.getByLabel('Question text');
    await field.fill('Check $\\frac{1}{2}$ renders');
    await expect(page.getByTestId('math-preview').locator('.katex').first()).toBeVisible();
  });

  test('AC4: next and previous walk the paper', async ({ page }) => {
    await page.getByRole('button', { name: 'Open question 1' }).click();
    await expect(page.getByText('1 of', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.getByText('2 of', { exact: false })).toBeVisible();
  });

  test('mobile: the pane opens as a full-screen sheet with no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await assertNoHorizontalOverflow(page);
    await page.getByRole('button', { name: /^Open question / }).first().click();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page.getByRole('button', { name: 'Next question' }));
    await page.getByRole('button', { name: 'Close question' }).click();
    await expect(page.getByLabel('Question text')).toHaveCount(0);
  });

  test('zero console errors while editing', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.getByRole('button', { name: /^Open question / }).first().click();
    await page.getByRole('button', { name: 'Next question' }).click();
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e tests/e2e/nexus-qb-paper-workspace.spec.ts --project=nexus-chrome`
Expected: PASS. A timeout with no other detail usually means the dev server failed to boot, not that a selector is wrong; check the server output before editing selectors.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/nexus-qb-paper-workspace.spec.ts
git commit -m "test(nexus): e2e coverage for the merged paper questions view"
```

---

## Self-Review

**Spec coverage.** This plan covers the spec's section 1 in full: merged tab (Task 9), one-line rows with MathText and a tag count (Task 2), section runs and bulk selection (Task 3), the four compactness changes (Task 5), LaTeX previews (Tasks 1 and 5), the detail pane with navigation and the mobile sheet (Tasks 7 and 8), and section editing moved into the form (Task 6). Spec sections 2 (source PDF and JSON) and 3 (tags) are **deliberately out of scope** and get their own plans; `PaperQuestionDetail` takes a single Edit view here, and gains a tab strip when the Source tab arrives. `tagCounts` is already a prop so the tag plan has somewhere to feed counts in without reshaping these components.

**Placeholder scan.** No TBDs. Every code step carries real code. Task 9 Step 1 is a `grep` whose result decides a deletion rather than a guess, which is a genuine investigation step, not a placeholder.

**Type consistency.** `onChangeSections(questionIds: string[], section: QBQuestionSection): Promise<void>` is identical in Tasks 3, 8 and 9 and matches the existing page handler. `onChangeSection(questionId, section)` (singular) appears only in Tasks 6 and 7 and is adapted by `PaperWorkspace.changeOne`. `tagCounts: Record<string, number>` is the same in Tasks 3 and 8. `position: { index, total }` is 1-based in both Tasks 7 and 8. `MathField`'s `previewWhenPlain` default was documented as `true` in the Task 1 interface block while the implementation and its test both use `false`. Fixed inline: the default is `false`, so a plain-text field renders no preview.

## Follow-on plans

1. **Source PDF and JSON compare** (spec section 2): `nexus_qb_paper_imports`, the drive pickers, the Source tab, the drift badge.
2. **Tags on the paper page** (spec section 3): TagPicker in the pane, the free scanner over `tag-resolver.ts`, the alias-learning loop, bulk tag apply.
