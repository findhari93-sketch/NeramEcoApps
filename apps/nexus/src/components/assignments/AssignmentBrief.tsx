'use client';

/**
 * An assignment's brief, rendered as a paper rather than a wall of text.
 *
 * Two things are happening here, and only one of them is styling:
 *
 *  - Maths renders. Everything goes through MathText, so $...$ and $$...$$ come
 *    out as formulas. Briefs written before this still work: text with no
 *    delimiters takes MathText's plain-text fast path.
 *  - Structure that was already in the text becomes structure on screen.
 *    parseAssignmentBrief finds the question headings and mark values a teacher
 *    already typed, so existing assignments improve without being re-authored.
 *
 * When the parser recognises nothing, the original text is rendered as one
 * block. That fallback is the point: a brief that is genuinely a paragraph
 * should look like a paragraph, not be forced into cards.
 */
import { Box, Stack, Typography, Chip, alpha, useTheme } from '@neram/ui';
import MathText from '@/components/common/MathText';
import { parseAssignmentBrief } from '@/lib/assignment-brief';

/**
 * A tinted, titled block. The brief has several of these now (expected outcome,
 * what to focus on, how to submit) and they only read as one family if they are
 * literally the same component.
 */
function LabelledBlock({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        p: { xs: 1.75, sm: 2 },
        borderRadius: 2,
        bgcolor: alpha(accent, 0.06),
        border: `1px solid ${alpha(accent, 0.22)}`,
      }}
    >
      <Typography
        variant="caption"
        component="h3"
        sx={{
          display: 'block',
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: accent,
          // The tinted backgrounds are light, so the label needs a darker ink
          // than the accent itself to clear 4.5:1.
          filter: 'brightness(0.75)',
          mb: 1,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

interface AssignmentBriefProps {
  instructions: string | null | undefined;
  /** What a finished, successful piece of work looks like. Its own block. */
  expectedOutcome?: string | null;
  /** What to concentrate on, one point per line. Rendered as a checklist. */
  focusPoints?: string | null;
  /**
   * Shown beside the total when the parsed marks disagree with the assignment's
   * configured max. Teacher-facing only: students should never be handed a
   * discrepancy they cannot act on.
   */
  maxMarks?: number | null;
  showMarksWarning?: boolean;
}

export default function AssignmentBrief({
  instructions,
  expectedOutcome,
  focusPoints,
  maxMarks,
  showMarksWarning = false,
}: AssignmentBriefProps) {
  const theme = useTheme();
  const brief = parseAssignmentBrief(instructions);

  const outcome = (expectedOutcome ?? '').trim();
  const focusList = (focusPoints ?? '')
    .split('\n')
    .map((line) => line.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean);
  const hasTask = !!instructions && !!instructions.trim();

  if (!hasTask && !outcome && !focusList.length) return null;

  /**
   * The two extra parts of the brief, in the same visual language as the
   * "How to submit" block below. They render for any assignment that has them,
   * not just drawings: "what does good look like" is a fair thing to say about
   * a maths paper too.
   */
  const extras = (
    <>
      {outcome && (
        <LabelledBlock title="Expected outcome" accent={theme.palette.success.main}>
          <MathText text={outcome} variant="body2" sx={{ lineHeight: 1.6 }} />
        </LabelledBlock>
      )}
      {focusList.length > 0 && (
        <LabelledBlock title="What to focus on" accent={theme.palette.warning.main}>
          <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {focusList.map((point, i) => (
              <Stack key={i} component="li" direction="row" spacing={1} alignItems="flex-start">
                <Box
                  aria-hidden
                  sx={{
                    mt: '7px',
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor: theme.palette.warning.dark,
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <MathText text={point} variant="body2" sx={{ lineHeight: 1.55 }} />
                </Box>
              </Stack>
            ))}
          </Stack>
        </LabelledBlock>
      )}
    </>
  );

  // Nothing recognised in the task text: render what the teacher wrote, with
  // maths, and the labelled parts after it.
  if (!brief.structured) {
    return (
      <Stack spacing={2}>
        {hasTask && <MathText text={instructions!} variant="body2" sx={{ lineHeight: 1.65 }} />}
        {extras}
      </Stack>
    );
  }

  const marksMismatch =
    showMarksWarning &&
    brief.totalMarks != null &&
    maxMarks != null &&
    Math.abs(brief.totalMarks - maxMarks) > 0.001;

  return (
    <Stack spacing={2}>
      {brief.intro && (
        <MathText text={brief.intro} variant="body2" sx={{ lineHeight: 1.65 }} />
      )}

      {brief.questions.length > 0 && (
        <Stack spacing={1.5} component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {brief.questions.map((q) => (
            <Box
              key={q.label}
              component="li"
              sx={{
                p: { xs: 1.75, sm: 2 },
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                alignItems="flex-start"
                sx={{ mb: q.title || q.body ? 1 : 0 }}
              >
                <Box
                  sx={{
                    flexShrink: 0,
                    px: 1,
                    minWidth: 34,
                    height: 24,
                    borderRadius: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.01em',
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    color: 'primary.main',
                  }}
                >
                  {q.label}
                </Box>
                {q.title && (
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <MathText
                      text={q.title}
                      variant="subtitle2"
                      sx={{ fontWeight: 700, lineHeight: 1.4 }}
                    />
                  </Box>
                )}
                {q.marks != null && (
                  <Chip
                    size="small"
                    label={`${q.marks} ${q.marks === 1 ? 'mark' : 'marks'}`}
                    sx={{
                      flexShrink: 0,
                      height: 22,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      bgcolor: alpha(theme.palette.text.primary, 0.06),
                      color: 'text.secondary',
                    }}
                  />
                )}
              </Stack>

              {q.body && (
                <MathText
                  text={q.body}
                  variant="body2"
                  sx={{
                    lineHeight: 1.65,
                    color: 'text.secondary',
                    // The maths in these briefs is the content, not decoration,
                    // so it gets room to breathe rather than being crammed
                    // against the heading.
                    '& .katex': { fontSize: '1.05em' },
                  }}
                />
              )}
            </Box>
          ))}
        </Stack>
      )}

      {brief.totalMarks != null && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            Total: {brief.totalMarks} marks across {brief.questions.length}{' '}
            {brief.questions.length === 1 ? 'question' : 'questions'}
          </Typography>
          {marksMismatch && (
            <Chip
              size="small"
              label={`Assignment is set to ${maxMarks}`}
              sx={{
                height: 22,
                fontSize: '0.7rem',
                fontWeight: 700,
                bgcolor: alpha('#EF6C00', 0.14),
                color: '#B54700',
              }}
            />
          )}
        </Stack>
      )}

      {extras}

      {brief.guidelines.length > 0 && (
        <LabelledBlock title="How to submit" accent={theme.palette.primary.main}>
          <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {brief.guidelines.map((g, i) => (
              <Stack key={i} component="li" direction="row" spacing={1} alignItems="flex-start">
                <Box
                  aria-hidden
                  sx={{
                    mt: '7px',
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor: 'primary.main',
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <MathText text={g} variant="body2" sx={{ lineHeight: 1.55 }} />
                </Box>
              </Stack>
            ))}
          </Stack>
        </LabelledBlock>
      )}
    </Stack>
  );
}
