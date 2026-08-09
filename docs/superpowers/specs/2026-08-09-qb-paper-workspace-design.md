# Question Bank paper workspace redesign

**Date:** 2026-08-09
**Status:** Approved, ready for implementation planning
**Route:** `/teacher/question-bank/papers/[id]` (Nexus, teacher panel)

## Problem

A teacher preparing a previous-year paper cannot do the job in one place.

1. **Answer Key and Questions are two tabs over the same 92 rows.** The Answer Key sets the answer and the section but not the text. The Questions tab sets the text but not the section. Neither edits a whole question, so the teacher bounces between them.
2. **There is no way to check an extraction.** The PDF given to the AI and the JSON it returned are both discarded at import, so when a question looks wrong there is nothing to compare it against.
3. **Tags are invisible here.** The registry that drives filtering and learning cannot be reached from the paper page, so tags are corrected somewhere else or not at all.
4. **LaTeX is not rendered in the editor.** Question text and options are plain text fields, so a maths question reads as `$c = 1$`.
5. **One question does not fit on a screen.** The editor is roughly 900px tall before the Classification section, so a teacher never sees a whole question at once.

## Current state (verified 2026-08-09 against production)

| Fact | Evidence |
|---|---|
| No source PDF stored | `nexus_qb_original_papers.pdf_url` is NULL on all 26 papers; `study_file_id` NULL on all 26 |
| No source JSON stored anywhere | No column exists on any table |
| Tag registry is real and in use | `nexus_qb_tags` 78 active (2 exam, 67 subject, 9 theme); `nexus_qb_question_tags` 7,405 links |
| This paper is fully tagged already | 274 links across 92 questions, zero untagged |
| Alias coverage is uneven | 43/67 subject tags have aliases (avg 2.7); exam and theme tags have none; maths parents (`algebra`, `calculus`, `coordinate_geometry`) have none |
| Categories and tags are not interchangeable | 114 distinct category slugs in use, only 64 have a matching tag slug |
| `InlineQuestionEditor` is 776 lines | Imports `MathText` but uses it only in the collapsed preview |

Components that already exist and are reused rather than rebuilt:

- `components/shared/DriveFilePickerDialog.tsx` — searches SharePoint, the caller's OneDrive, and anything shared with them, through the tenant search index. Its `both` scope is exactly the "a colleague shared a folder out of their OneDrive" case (CommonPC).
- `lib/tag-resolver.ts` — free, deterministic tag index over slug, label and aliases; shape- and plural-insensitive; already tested.
- `components/question-bank/TagPicker.tsx` — grouped Exam/Subject/Theme autocomplete with inline create.
- `components/common/MathText.tsx` — KaTeX renderer for `$...$` and `$$...$$`.
- The selection and bulk-apply bar added to `AnswerKeyGrid` on 2026-08-09 for sections.

## Non-goals

- ~~Editing the stored JSON and re-importing it.~~ **Revised 2026-08-09 after review:** the JSON must round-trip. A UI edit has to show up in the JSON and a JSON edit has to show up in the UI. See "The JSON round-trips" below, which replaces the read-only design.
- Any LLM-backed tagging. The user's requirement is explicitly free and automated.
- Changing how students see a paper. The Student access tab and `study_file_id` behaviour are untouched.
- Migrating the 26 existing papers to have sources. There is no data to migrate; sources are attached by hand.
- Reconciling the `categories` and `nexus_qb_tags` vocabularies. They stay side by side.

---

## 1. The merged Questions view

**Tabs become: Questions · Bulk Images · Student access.** Answer Key and Questions merge into one tab named Questions.

### List (left)

One line per question that stays one line:

```
Q#  |  stem (MathText, clamped to 1 line)  |  type  |  section  |  answer  |  n tags  |  status
```

The tag column is a **count**, not chips: chips for three tags would cost more horizontal room than the stem can spare. Zero reads as a gap worth filling, and the chips themselves live in the detail pane.

- Section headers break the list into runs, driven by `qbPaperSectionRuns`, the same function the summary chips and exam scheduler use.
- The tick box, range picker (`Q__ to Q__`) and bulk bar move here unchanged from `AnswerKeyGrid`, and gain a second bulk action for tags alongside the existing section action.
- A row badges when its text or options differ from the stored import payload (see section 2).
- Selecting a row loads it into the detail pane; it does not expand in place.

### Detail pane (right)

Holds exactly one question. `◀ ▶` buttons plus `j` / `k` move between questions without returning to the list. Two tabs: **Edit** and **Source**.

Below the `md` breakpoint (900px) the pane becomes a full-screen sheet over the list, because a two-pane split does not fit a phone. This follows the existing mobile pattern in this app.

### Making a question fit one screen

Applied to the editor, in order of space recovered:

1. **Hindi fields collapse behind a single toggle.** There are eight of them (one per text field plus one per option) and they are empty on every question of this paper.
2. **The image dropzone becomes a strip** unless the question already has an image or `questionNeedsImage()` returns true for it. That helper already exists in `AnswerKeyGrid.tsx`.
3. **Options become a compact grid**: one row each, radio for correct answer, text inline, no per-option stacked block.
4. **Classification splits into labelled Tags and Categories sections** rather than one accordion holding everything.

### LaTeX while editing

Each text field (question text, each option, explanations) gets a live preview line beneath it rendering the typeset result through `MathText`. The field stays a plain textarea holding LaTeX source; the preview is read-only. This solves "the math formulas are broken" without a WYSIWYG editor, which LaTeX does not survive.

---

## 2. Source PDF and JSON

### The source PDF is linked, not uploaded

The source PDF and the student-facing PDF are **separate fields**, deliberately:

- **Student-facing** (`study_file_id`, unchanged) must live in Study Materials, which owns the secure viewer, download grants and the publish switch.
- **Source** is teacher-only verification and needs none of that.

Linking one file to both is a one-click action when they are the same file.

**Both pickers gain drive search, by different routes.** The complaint that started this ("search the proper OneDrive where we store files in CommonPC, shared between admins and staff") was raised against the *Student access* picker, so fixing only the new teacher-only one would not answer it.

- **Source PDF (teacher-only):** `DriveFilePickerDialog` in `both` scope, storing the drive and item reference directly. Never a copy, so the file cannot fork or go stale. Rendered through the SharePoint content proxy already used elsewhere in the app.
- **Student-facing PDF:** the `StudyFilePicker` folder browser in `PaperStudentAccessPanel.tsx` gains drive search as a second way in. A drive item is not a Study Materials file and cannot be assigned to `study_file_id` as-is, so picking one **registers it into Study Materials first** (a study file row pointing at the same drive item), then links the resulting id. That keeps the secure viewer, download grants and publish switch intact while letting the teacher find the file by searching instead of navigating folders.

**Known dependency:** the `both` scope needs delegated `Files.Read.All`, which lives in `loginScopes.nexusTeacher`. Without admin consent in Azure the route falls back to a two-drive search and a folder shared out of another person's OneDrive will not be found. Verify consent before relying on this; see `project_msal_scope_addition_redirects` for why an unconsented scope is not a silent failure.

### The JSON round-trips, and that means two artifacts, not one

A single JSON document cannot both be the extraction baseline and track the teacher's edits. If it follows the edits, then comparing it against the questions always agrees, and the question it was stored to answer ("did the AI extract this correctly?") can no longer be asked. So there are two, and only one of them is stored:

| Artifact | Stored? | Mutable? | Purpose |
|---|---|---|---|
| **Import snapshot** | Yes, `nexus_qb_paper_imports` | Never | What the AI returned. The extraction baseline the Source tab compares against. |
| **Live JSON** | **No, generated from the question rows on demand** | Yes, applying it writes back to the rows | The round-trip document a teacher reads and edits. |

Generating the live JSON rather than storing it is what makes "a UI change shows up in the JSON" true by construction. It is a projection of the rows, so it cannot drift, and there is no synchronisation code to get wrong. The bug class where two stored copies disagree simply does not exist.

**Both directions:**

- **UI to JSON:** automatic. Editing a question writes the row; the next render of the live JSON reads that row. Nothing to implement beyond the generator.
- **JSON to UI:** an Apply action parses the edited document, diffs it against the current rows, shows what would change, and writes on confirmation. It must refuse to silently drop fields it does not understand, and must never clear `correct_answer`, `section` or tags that the document omits, since those are edited elsewhere and an omission is not an instruction to delete.

**Media fields must round-trip too.** The current import schema carries `question_image`, per-option `image` and `solution_video_url`, but **has no `solution_image_url` field**, so a solution image added in the UI has nowhere to go. Add it. The generated document emits stored URLs (not base64) for `question_image_url`, each option's `image_url`, `solution_image_url` and `solution_video_url`, so a teacher can see at a glance which media a question carries. On Apply, an `http(s)` URL is stored as-is and a `data:` URL is uploaded first, matching what the bulk importer already does.

**The drift badge now compares against the snapshot,** not the live JSON, since the live JSON can never differ from the rows. A badge means "this question no longer matches what the AI extracted", which is the signal that was wanted.

### The import snapshot goes in its own table

```sql
create table nexus_qb_paper_imports (
  id uuid primary key default gen_random_uuid(),
  original_paper_id uuid not null references nexus_qb_original_papers(id) on delete cascade,
  payload jsonb not null,
  question_count integer not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index on nexus_qb_paper_imports (original_paper_id, created_at desc);
```

Not a column on the paper row: a 92-question payload is a few hundred KB and every existing paper query would carry it. A row per import also preserves the previous payload when a paper is re-imported, so a teacher can see what a re-run changed.

`UploadJSONTab` currently parses the JSON and discards the raw text. It will pass the raw payload through to `POST /api/question-bank/papers`, which writes the import row alongside the questions.

### The Source tab

PDF on the left, the JSON fragment for the selected question on the right, matched by `question_number`. The rendered question is in the Edit tab beside it, completing the three-way comparison.

**Two acknowledged limits:**

- The import schema carries no page numbers, so the PDF opens at page one and the teacher scrolls. Add an optional `source_page` to the bulk-upload schema so future imports anchor directly. Do not fabricate it for existing papers.
- The 26 existing papers have no source. They get an **Attach source** action to link a PDF and paste the JSON retrospectively.

### Drift badge

With both the import payload and the live rows available, compare `question_text` and option texts and badge rows that differ from what was imported. This is a string comparison, not an inference. It is informational, not a warning: a teacher editing a question is the expected case, and the badge is what answers "has this been extracted properly".

---

## 3. Tags

### Visible and editable

The detail pane shows current tags as chips and edits them with the existing `TagPicker`, grouped Exam / Subject / Theme.

`categories` stay, under their own heading. They are not derivable from tags: 114 distinct category slugs are in use and only 64 have a matching tag slug, so deriving one from the other would silently discard 50.

### Free automated tagging by scanning

A new scanner sits on top of `lib/tag-resolver.ts`:

1. Build the phrase index from every active tag's slug, label and aliases (`buildTagIndex` already does this).
2. Walk the question text and every option text looking for those phrases.
3. Propose the tags found, as **pending chips the teacher accepts or dismisses**. Nothing writes itself.

No model, no API key, no spend cap. Deterministic, and testable the same way the section inference is: a fixture of real questions with the tags they should produce.

**Expected accuracy, stated plainly.** Aptitude tags are richly aliased (`perspective` 10 aliases, `design_fundamentals` 8, `building_materials` and `building_services` 7 each) and aptitude questions are prose, so questions like "Plaster of Paris is used for" and "The Parliament House, New Delhi is designed by" should tag well. The maths half will barely tag: those questions are largely LaTeX, and the maths tags are structural parents (`algebra` 11 children, `calculus` 7, `coordinate_geometry` 8) with zero aliases. Exam and theme tags have no aliases either.

### The alias-learning loop

When a teacher adds a tag by hand that the scanner did not propose, offer to remember the phrase as an alias for that tag, writing to `nexus_qb_tags.aliases`. This is what makes a free system improve: the vocabulary sharpens with use and the next paper scans better than this one.

Seeding aliases on the maths parents and the nine theme tags is content work, done once, not code. It is what moves maths tagging from "barely" to "useful", and should be tracked separately.

### Bulk apply

Tick Q41–Q70, add a tag to all of them in one call, using the selection bar from section 1.

---

## Data model summary

| Change | Table | Note |
|---|---|---|
| New table | `nexus_qb_paper_imports` | payload, question_count, who, when |
| New columns | `nexus_qb_original_papers.source_drive_id`, `.source_item_id`, `.source_file_name` | teacher-only source PDF reference |
| Unchanged | `study_file_id`, `pdf_url` | student-facing paper, untouched |
| Written by the alias loop | `nexus_qb_tags.aliases` | already exists |

## API summary

| Endpoint | Change |
|---|---|
| `POST /api/question-bank/papers` | also writes the import row from the raw payload |
| `GET /api/question-bank/papers/[id]/import` | new: the frozen snapshot, for the Source tab |
| `GET /api/question-bank/papers/[id]/json` | new: the live JSON generated from the question rows |
| `POST /api/question-bank/papers/[id]/json` | new: apply an edited document. `?dryRun=1` returns the diff without writing |
| `PATCH /api/question-bank/papers/[id]` | accepts the source PDF reference |
| `POST /api/study-materials/files` | accepts a drive item, registering it as a study file so the student picker can offer drive search |
| `POST /api/question-bank/questions/[id]/suggest-tags` | new: runs the scanner, returns proposals, writes nothing |
| `POST /api/question-bank/questions/bulk-update` | extend with a `set_tags` / `add_tags` action |
| `PATCH /api/question-bank/tags/[id]` | accepts an alias addition |

## Testing

- **Unit, the scanner:** a fixture of real questions from the 2006 paper with expected tags, mirroring `qb-section-inference.test.ts`. Must assert the honest cases too: a maths question with no aliased tag produces no proposals rather than a wrong one.
- **Unit, drift comparison:** identical payload and row produce no badge; an edited stem does.
- **Component, the merged view:** selecting a row loads the detail pane; `◀ ▶` moves; bulk tag apply calls once with all ids; LaTeX renders in the preview and the field keeps its source.
- **E2E (`*nexus*.spec.ts`), mobile-first at 375px:** the detail pane opens as a full-screen sheet, no horizontal overflow, touch targets ≥ 44px.
- **Role-based:** all of this is staff-only. A student token against every new route must be denied.

## Rollout

1. Data model and API, no UI change.
2. Merged Questions view with the compact editor and LaTeX previews. This alone resolves problems 1, 4 and 5.
3. Source PDF linking and the Source tab, plus Attach source for existing papers.
4. Tag visibility, the scanner and the alias loop.

Each stage is independently shippable. No deploy without an explicit instruction.

## Open items

- Confirm delegated `Files.Read.All` consent in Azure before stage 3, or the drive search silently degrades.
- Alias seeding for maths parents, exam and theme tags: content work, owner and timing to be decided.
