/**
 * Standardized prompt templates for manual drawing evaluation via Gemini/ChatGPT.
 * No API calls here. Teachers copy these prompts and paste them into Gemini
 * along with the student's drawing image for evaluation.
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

// ─── Prompt Templates ────────────────────────────────────────────────────────

const MEDIUM_CONTEXT: Record<DrawingMedium, string> = {
  graphite_pencil:
    'This is a graphite pencil sketch on white paper. Evaluate shading gradients, pencil pressure control, tonal range from light to dark, and clean line work.',
  charcoal_pencil:
    'This is a charcoal pencil sketch. Evaluate bold stroke quality, deep contrast between highlights and shadows, expressive mark-making, and texture handling.',
  color_pencil:
    'This is a color pencil drawing. Evaluate color blending, layering technique, color harmony, saturation control, and smooth transitions between hues.',
};

const LEVEL_EXPECTATIONS: Record<SkillLevel, string> = {
  beginner:
    'The student is a beginner. Focus on basic shape accuracy, simple proportions, and fundamental techniques. Be encouraging while pointing out foundational improvements. The corrected reference should show clean, simple forms with basic shading.',
  medium:
    'The student is at an intermediate level. Evaluate proportional accuracy, consistent shading, depth perception, and composition balance. The corrected reference should demonstrate proper technique with moderate detail and clean execution.',
  expert:
    'The student is at an advanced level. Evaluate professional-grade technique, subtle tonal transitions, compositional mastery, perspective accuracy, and artistic expression. The corrected reference should be a polished, exhibition-ready version.',
};

/**
 * Builds a combined prompt that asks Gemini to do all 3 tasks in one shot:
 * 1. Annotate the drawing with arrows/circles showing mistakes and improvements
 * 2. Generate a corrected reference version at the appropriate skill level
 * 3. Provide detailed text feedback with rating
 */
export function buildCombinedPrompt(
  medium: DrawingMedium,
  level: SkillLevel,
  regionAnnotations: RegionAnnotation[] = [],
  questionContext?: string,
): string {
  const sections: string[] = [];

  // Header
  sections.push('You are an expert art instructor evaluating a student drawing. Please perform ALL THREE tasks below on the attached student drawing image.\n');

  // Context
  sections.push(`DRAWING MEDIUM: ${MEDIUM_LABELS[medium]}`);
  sections.push(`STUDENT LEVEL: ${LEVEL_LABELS[level]}`);
  sections.push(`${MEDIUM_CONTEXT[medium]}`);
  sections.push(`${LEVEL_EXPECTATIONS[level]}\n`);

  // Question context if available
  if (questionContext) {
    sections.push(`ASSIGNMENT: ${questionContext}\n`);
  }

  // Teacher's region annotations
  if (regionAnnotations.length > 0) {
    sections.push('TEACHER OBSERVATIONS (areas the teacher has highlighted on the drawing):');
    regionAnnotations.forEach((ann, i) => {
      const region = `Region ${i + 1} at (${Math.round(ann.x)}%, ${Math.round(ann.y)}%) to (${Math.round(ann.x + ann.width)}%, ${Math.round(ann.y + ann.height)}%)`;
      sections.push(`  ${region}: ${ann.comment}`);
    });
    sections.push('Please address each of these teacher observations in your evaluation, plus identify any additional issues.\n');
  }

  // Task 1: Annotation
  sections.push('TASK 1: ANNOTATED OVERLAY');
  sections.push('Create a copy of the student drawing with visual annotations showing mistakes and areas for improvement:');
  sections.push('  - Use red curved arrows pointing to problem areas');
  sections.push('  - Circle areas that need attention');
  sections.push('  - Add short text labels near each annotation (e.g., "Fix shadow direction", "Improve proportion")');
  sections.push('  - Use leader lines connecting labels to specific areas');
  sections.push('  - Keep the original drawing clearly visible under the annotations');
  sections.push('  - Also highlight what the student did well with green checkmarks or notes\n');

  // Task 2: Corrected reference
  sections.push('TASK 2: CORRECTED REFERENCE IMAGE');
  sections.push(`Generate a corrected version of this drawing at the ${LEVEL_LABELS[level].toLowerCase()} level.`);
  sections.push('  - Same composition and objects as the student drawing');
  sections.push(`  - Use ${MEDIUM_LABELS[medium].toLowerCase()} style`);
  sections.push('  - Show proper technique, proportions, shading, and composition');
  sections.push('  - This serves as a visual reference for what the student should aim for\n');

  // Task 3: Written feedback
  sections.push('TASK 3: WRITTEN FEEDBACK');
  sections.push('Provide detailed text feedback covering:');
  sections.push('  - Overall impression (1-2 sentences)');
  sections.push('  - Composition analysis');
  sections.push('  - Proportion accuracy');
  sections.push('  - Shading and tonal quality');
  sections.push('  - Technique assessment');
  sections.push('  - 3 specific improvement tips the student can practice');
  sections.push('  - A suggested rating: Needs Work / Below Average / Good / Very Good / Excellent');
  sections.push('  - An encouraging closing note\n');

  // Output format
  sections.push('OUTPUT FORMAT:');
  sections.push('1. First, show the annotated overlay image');
  sections.push('2. Then, show the corrected reference image');
  sections.push('3. Finally, provide the written feedback text');

  return sections.join('\n');
}
