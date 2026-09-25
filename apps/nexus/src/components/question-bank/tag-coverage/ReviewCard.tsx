'use client';

import { Box, Chip, Paper, Skeleton, Stack, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CheckIcon from '@mui/icons-material/Check';
import AddIcon from '@mui/icons-material/Add';
import { isCorrectOption, readOptions, splitHighlights } from '@/lib/tag-coverage-view';
import type { SuggestionItem } from './types';

interface Props {
  item: SuggestionItem;
  topic: { tag_id: string; label: string };
  selectedTagIds: Set<string>;
  onToggleTag: (tagId: string) => void;
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const theme = useTheme();
  return (
    <>
      {splitHighlights(text, terms).map((seg, i) =>
        seg.hit ? (
          <Box
            key={i}
            component="mark"
            sx={{
              bgcolor: alpha(theme.palette.warning.main, 0.28),
              color: 'inherit',
              borderRadius: 0.5,
              px: 0.25,
              fontWeight: 600,
            }}
          >
            {seg.text}
          </Box>
        ) : (
          <Box key={i} component="span">
            {seg.text}
          </Box>
        ),
      )}
    </>
  );
}

/**
 * One suggestion, everything a teacher needs to say yes or no without opening
 * the question: the text, the options with the answer marked, the words that
 * triggered the suggestion, and the tags that Accept will write.
 */
export default function ReviewCard({ item, topic, selectedTagIds, onToggleTag }: Props) {
  const theme = useTheme();
  const options = readOptions(item.options);
  const chips = [{ tag_id: topic.tag_id, label: topic.label, primary: true }].concat(
    item.also_suggested.map((t) => ({ tag_id: t.tag_id, label: t.label, primary: false })),
  );

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Chip size="small" variant="outlined" label={item.source_label} />
        <Chip
          size="small"
          color={item.confidence === 'high' ? 'success' : 'default'}
          variant={item.confidence === 'high' ? 'filled' : 'outlined'}
          label={item.confidence === 'high' ? 'Strong match' : 'One clue'}
        />
        {item.exam_relevance && (
          <Chip size="small" variant="outlined" label={item.exam_relevance === 'BOTH' ? 'NATA and JEE' : item.exam_relevance} />
        )}
      </Stack>

      <Typography
        component="h3"
        sx={{ fontSize: '1rem', lineHeight: 1.55, fontWeight: 500, whiteSpace: 'pre-line', overflowWrap: 'anywhere', mb: 1.5 }}
      >
        <Highlighted text={item.question_text || '(This question has no text, only a figure.)'} terms={item.matched_terms} />
      </Typography>

      {options.length > 0 && (
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mb: 2, display: 'grid', gap: 0.75 }}>
          {options.map((opt) => {
            const correct = isCorrectOption(opt.id, item.correct_answer);
            return (
              <Box
                component="li"
                key={opt.id}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  px: 1.25,
                  py: 1,
                  borderRadius: 1.5,
                  border: 1,
                  borderColor: correct ? 'success.main' : 'divider',
                  bgcolor: correct ? alpha(theme.palette.success.main, 0.08) : 'transparent',
                }}
              >
                <Typography component="span" sx={{ fontWeight: 700, textTransform: 'uppercase', minWidth: 18, fontSize: '0.9rem' }}>
                  {opt.id}
                </Typography>
                <Typography component="span" sx={{ flex: 1, fontSize: '0.95rem', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  <Highlighted text={opt.text || '(figure)'} terms={item.matched_terms} />
                </Typography>
                {correct && (
                  <Box
                    component="span"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'success.dark', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}
                  >
                    <CheckCircleOutlineIcon sx={{ fontSize: 18 }} aria-hidden />
                    Answer
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
        <Typography variant="subtitle2" component="h4" sx={{ fontWeight: 700, mb: 0.75 }}>
          Why this was suggested
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {item.matched_terms.length >= 2
            ? `It mentions ${item.matched_terms.length} different words linked to ${topic.label}:`
            : `It mentions one word linked to ${topic.label}:`}
        </Typography>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          {item.matched_terms.map((term) => (
            <Chip
              key={term}
              size="small"
              label={term}
              sx={{ bgcolor: alpha(theme.palette.warning.main, 0.2), fontWeight: 600 }}
            />
          ))}
        </Stack>

        <Typography variant="subtitle2" component="h4" sx={{ fontWeight: 700, mb: 0.75 }}>
          Tags to add
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" role="group" aria-label="Tags to add">
          {chips.map((c) => {
            const on = selectedTagIds.has(c.tag_id);
            return (
              <Chip
                key={c.tag_id}
                clickable
                onClick={() => onToggleTag(c.tag_id)}
                aria-pressed={on}
                icon={on ? <CheckIcon aria-hidden /> : <AddIcon aria-hidden />}
                label={c.primary ? c.label : `${c.label} (also matches)`}
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                sx={{ height: 44, borderRadius: 22, fontWeight: 600, px: 0.5 }}
              />
            );
          })}
        </Stack>
      </Box>
    </Paper>
  );
}

export function ReviewCardSkeleton() {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }} aria-busy="true" aria-label="Loading the next question">
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <Skeleton variant="rounded" width={96} height={24} />
        <Skeleton variant="rounded" width={96} height={24} />
      </Stack>
      <Skeleton variant="text" height={28} />
      <Skeleton variant="text" height={28} width="80%" sx={{ mb: 1.5 }} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rounded" height={40} sx={{ mb: 0.75 }} />
      ))}
      <Skeleton variant="text" width="40%" sx={{ mt: 2 }} />
      <Skeleton variant="rounded" width="60%" height={44} sx={{ mt: 1, borderRadius: 22 }} />
    </Paper>
  );
}
