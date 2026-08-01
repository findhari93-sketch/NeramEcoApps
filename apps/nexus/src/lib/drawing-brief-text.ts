/**
 * The one-string version of a drawing brief, for the Drawing Review screen.
 *
 * A drawing assignment keeps a backing `drawing_questions` row whose
 * `question_text` is what a reviewer reads while marking. That row has one text
 * field, while the brief now has three parts, so the parts are folded together
 * here rather than at each call site.
 *
 * Folding rather than dropping matters: "what to focus on" is precisely the list
 * a reviewer should be marking against, and before this it was invisible to them.
 *
 * Headings are plain words on their own line, which is what parseAssignmentBrief
 * already treats as structure, so the reviewer sees the same shape the student
 * does.
 */

export interface DrawingBriefParts {
  instructions?: string | null;
  expected_outcome?: string | null;
  focus_points?: string | null;
}

export function composeDrawingBriefText(parts: DrawingBriefParts, fallbackTitle: string): string {
  const blocks: string[] = [];

  const task = (parts.instructions ?? '').trim();
  blocks.push(task || fallbackTitle);

  const outcome = (parts.expected_outcome ?? '').trim();
  if (outcome) blocks.push(`Expected outcome:\n${outcome}`);

  const focus = (parts.focus_points ?? '').trim();
  if (focus) {
    // One point per line in, one bullet per line out. Blank lines are dropped so
    // a stray return does not become an empty bullet.
    const bullets = focus
      .split('\n')
      .map((line) => line.trim().replace(/^[-*•]\s*/, ''))
      .filter(Boolean)
      .map((line) => `- ${line}`)
      .join('\n');
    if (bullets) blocks.push(`Focus on:\n${bullets}`);
  }

  return blocks.join('\n\n');
}
