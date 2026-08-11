/**
 * Standardized prompt templates for manual drawing evaluation via Gemini/ChatGPT.
 * No API calls here. Teachers copy these prompts and paste them into Gemini
 * along with the student's drawing image for evaluation.
 *
 * IMPORTANT: Gemini generates one image per response. So we provide 3 separate
 * prompts: annotation overlay (image), corrected reference (image), and
 * text feedback (text). Teachers run each separately in Gemini.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type DrawingMedium = 'graphite_pencil' | 'charcoal_pencil' | 'color_pencil';

export type SkillLevel = 'beginner' | 'medium' | 'expert';

export interface RegionAnnotation {
  id: string;
  x: number;      // percentage 0-100 from left
  y: number;      // percentage 0-100 from top
  width: number;  // percentage 0-100
  height: number; // percentage 0-100
  comment: string;
}

// ─── Rating Labels ───────────────────────────────────────────────────────────

export const RATING_LABELS: Record<number, string> = {
  1: 'Needs Work',
  2: 'Below Average',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

// ─── Medium Labels ───────────────────────────────────────────────────────────

export const MEDIUM_LABELS: Record<DrawingMedium, string> = {
  graphite_pencil: 'Graphite Pencil',
  charcoal_pencil: 'Charcoal Pencil',
  color_pencil: 'Color Pencil',
};

export const LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  medium: 'Intermediate',
  expert: 'Advanced',
};

// ─── Medium Detection ────────────────────────────────────────────────────────

export function getMediumFromCategory(category: string): DrawingMedium {
  switch (category) {
    case '2d_composition': return 'graphite_pencil';
    case '3d_composition': return 'graphite_pencil';
    case 'kit_sculpture': return 'charcoal_pencil';
    default: return 'graphite_pencil';
  }
}

// ─── Shared Context Builders ─────────────────────────────────────────────────

const MEDIUM_CONTEXT: Record<DrawingMedium, string> = {
  graphite_pencil:
    'This is a graphite pencil sketch on white paper. Focus on shading gradients, pencil pressure control, tonal range, and clean line work.',
  charcoal_pencil:
    'This is a charcoal pencil sketch. Focus on bold stroke quality, deep contrast between highlights and shadows, expressive mark-making, and texture.',
  color_pencil:
    'This is a color pencil drawing. Focus on color blending, layering technique, color harmony, saturation control, and smooth transitions.',
};

const LEVEL_EXPECTATIONS: Record<SkillLevel, string> = {
  beginner:
    'The student is a beginner. Focus on basic shape accuracy, simple proportions, and fundamental techniques. Be encouraging.',
  medium:
    'The student is at an intermediate level. Evaluate proportional accuracy, consistent shading, depth, and composition balance.',
  expert:
    'The student is at an advanced level. Evaluate professional technique, subtle tonal transitions, compositional mastery, and artistic expression.',
};

function buildContext(
  medium: DrawingMedium,
  level: SkillLevel,
  regionAnnotations: RegionAnnotation[] = [],
  questionContext?: string,
): string {
  const lines: string[] = [];
  lines.push(`DRAWING MEDIUM: ${MEDIUM_LABELS[medium]}`);
  lines.push(`STUDENT LEVEL: ${LEVEL_LABELS[level]}`);
  lines.push(MEDIUM_CONTEXT[medium]);
  lines.push(LEVEL_EXPECTATIONS[level]);

  if (questionContext) {
    lines.push(`\nASSIGNMENT: ${questionContext}`);
  }

  if (regionAnnotations.length > 0) {
    lines.push('\nTEACHER OBSERVATIONS (areas the teacher highlighted):');
    regionAnnotations.forEach((ann, i) => {
      const region = `Region ${i + 1} at (${Math.round(ann.x)}%, ${Math.round(ann.y)}%) to (${Math.round(ann.x + ann.width)}%, ${Math.round(ann.y + ann.height)}%)`;
      lines.push(`  ${region}: ${ann.comment || '(no comment)'}`);
    });
    lines.push('Address each teacher observation in your response, plus identify additional issues.');
  }

  return lines.join('\n');
}

// ─── Prompt 1: Annotation Overlay (Image Output) ────────────────────────────

export function buildAnnotationPrompt(
  medium: DrawingMedium,
  level: SkillLevel,
  regionAnnotations: RegionAnnotation[] = [],
  questionContext?: string,
): string {
  const context = buildContext(medium, level, regionAnnotations, questionContext);

  return `You are an expert art instructor. Generate an ANNOTATED VERSION of the attached student drawing image.

${context}

TASK: Create an annotated overlay image of this drawing showing mistakes and improvements.

Requirements:
- Keep the original student drawing clearly visible as the base
- Draw red curved arrows pointing to problem areas
- Circle areas that need attention using red/orange outlines
- Add short text labels near each annotation (e.g., "Fix shadow direction", "Improve proportion here")
- Use leader lines connecting labels to specific areas
- Highlight what the student did well with green checkmarks or positive notes
- Make sure the annotations are clearly readable over the drawing

OUTPUT: Generate a single annotated image showing all corrections and feedback visually on top of the student's drawing.`;
}

// ─── Prompt 2: Corrected Reference (Image Output) ───────────────────────────

export function buildReferencePrompt(
  medium: DrawingMedium,
  level: SkillLevel,
  questionContext?: string,
): string {
  return `You are an expert art instructor. Generate a CORRECTED REFERENCE VERSION of the attached student drawing.

DRAWING MEDIUM: ${MEDIUM_LABELS[medium]}
STUDENT LEVEL: ${LEVEL_LABELS[level]}
${questionContext ? `ASSIGNMENT: ${questionContext}\n` : ''}
TASK: Create a corrected, polished version of this drawing at the ${LEVEL_LABELS[level].toLowerCase()} level.

Requirements:
- Same composition and objects as the student's drawing
- Use ${MEDIUM_LABELS[medium].toLowerCase()} style rendering
- Show proper technique, proportions, shading, and composition
- This serves as a visual reference showing what the student should aim for
- Make it look like a ${level === 'expert' ? 'professional, exhibition-ready' : level === 'medium' ? 'well-executed, technically correct' : 'clean, simple but correct'} version

OUTPUT: Generate a single corrected reference image.`;
}

// ─── Prompt 3: Text Feedback (Text Output) ──────────────────────────────────

export function buildFeedbackPrompt(
  medium: DrawingMedium,
  level: SkillLevel,
  regionAnnotations: RegionAnnotation[] = [],
  questionContext?: string,
): string {
  const context = buildContext(medium, level, regionAnnotations, questionContext);

  return `You are an expert art instructor evaluating a student drawing. Provide detailed TEXT FEEDBACK only (no images).

${context}

TASK: Write a comprehensive evaluation covering:

1. Overall Impression (1-2 sentences)
2. Composition Analysis
3. Proportion Accuracy
4. Shading and Tonal Quality
5. Technique Assessment
6. 3 Specific Improvement Tips the student can practice
7. Suggested Rating: Needs Work / Below Average / Good / Very Good / Excellent
8. An encouraging closing note

Keep the feedback constructive, specific, and actionable. Reference specific areas of the drawing where possible.`;
}

// ─── Prompt 4: Model Solution (Image Output) ────────────────────────────────

/**
 * The parts of a bank question that describe what a good answer looks like.
 *
 * Deliberately a plain shape rather than NexusQBQuestion: the panel calls this
 * with UNSAVED form state so a teacher can iterate on the wording, press Copy,
 * and see the prompt change without saving a draft they may throw away.
 */
export interface DrawingQuestionBrief {
  question_text: string | null;
  drawing_marks?: number | null;
  /** Feeds getMediumFromCategory when no medium is passed. */
  category?: string | null;
}

/**
 * Build the prompt a teacher pastes into Gemini to get a model answer image.
 *
 * The fourth of the copy-paste prompts, and the first that describes a QUESTION
 * rather than a student's submission. Same closing line as buildReferencePrompt
 * so the workflow a teacher already knows carries over.
 *
 * No API call. Nothing in this file talks to a model.
 */
export function buildSolutionPrompt(
  q: DrawingQuestionBrief,
  level: SkillLevel = 'expert',
  medium?: DrawingMedium,
): string {
  const chosenMedium = medium ?? getMediumFromCategory(q.category || '');
  const lines: string[] = [];

  lines.push('You are an expert architecture entrance-exam tutor. Generate a MODEL ANSWER image for the drawing question below.');
  lines.push('');
  lines.push(`DRAWING MEDIUM: ${MEDIUM_LABELS[chosenMedium]}`);
  lines.push(`TARGET LEVEL: ${LEVEL_LABELS[level]}`);
  lines.push(MEDIUM_CONTEXT[chosenMedium]);
  lines.push('');
  lines.push('QUESTION:');
  lines.push((q.question_text || '').trim() || '(no question text yet)');

  if (q.drawing_marks) lines.push('', `MARKS: ${q.drawing_marks}`);

  lines.push('');
  lines.push('Requirements:');
  lines.push('- Draw it as a student would on an exam answer sheet, inside a clean rectangular frame');
  lines.push(`- Render it by hand in ${MEDIUM_LABELS[chosenMedium].toLowerCase()}, not as a photograph and not as a 3D render`);
  lines.push('- Correct proportion, consistent light source, and a clear focal point');
  lines.push('- Satisfy every constraint listed above exactly, including counts and colour rules');
  lines.push('- No text labels, no arrows, no annotations, no watermark, and no signature on the image');
  lines.push('');
  lines.push('OUTPUT: Generate a single model answer image.');

  return lines.join('\n');
}

// ─── Prompt Type Labels (for UI) ─────────────────────────────────────────────

export type PromptType = 'annotation' | 'reference' | 'feedback' | 'solution';

/**
 * The prompts the review screen offers, which is every one that describes a
 * student's SUBMISSION.
 *
 * 'solution' is excluded deliberately: it describes a question and is built
 * from the authoring panel's form state, so there is nothing sensible for the
 * review screen to pass it. Narrowing here keeps that screen's switch
 * exhaustive, so adding a fifth prompt later fails to compile rather than
 * silently falling through with an unassigned variable.
 */
export type SubmissionPromptType = Exclude<PromptType, 'solution'>;

export const PROMPT_TYPE_LABELS: Record<PromptType, { label: string; description: string; icon: string }> = {
  annotation: {
    label: 'Annotation Overlay',
    description: 'Generates annotated image with arrows, circles, and labels',
    icon: '🖊️',
  },
  reference: {
    label: 'Corrected Reference',
    description: 'Generates a corrected version of the drawing',
    icon: '🎨',
  },
  feedback: {
    label: 'Text Feedback',
    description: 'Written evaluation with rating and improvement tips',
    icon: '📝',
  },
  solution: {
    label: 'Model Solution',
    description: 'Generates a reference answer image for this question',
    icon: '🖼️',
  },
};
