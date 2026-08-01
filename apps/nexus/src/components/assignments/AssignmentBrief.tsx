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

interface AssignmentBriefProps {
  instructions: string | null | undefined;
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
  maxMarks,
  showMarksWarning = false,
}: AssignmentBriefProps) {
  const theme = useTheme();
  const brief = parseAssignmentBrief(instructions);

  if (!instructions || !instructions.trim()) return null;

  // Nothing recognised: render what the teacher wrote, with maths.
  if (!brief.structured) {
    return <MathText text={instructions} variant="body2" sx={{ lineHeight: 1.65 }} />;
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

      {brief.guidelines.length > 0 && (
        <Box
          sx={{
            p: { xs: 1.75, sm: 2 },
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
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
              color: 'primary.main',
              mb: 1,
            }}
          >
            How to submit
          </Typography>
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
        </Box>
      )}
    </Stack>
  );
}
