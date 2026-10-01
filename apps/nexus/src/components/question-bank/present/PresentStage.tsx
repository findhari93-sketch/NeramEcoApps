'use client';

/**
 * The question as the class sees it on the shared screen: large, fitted to the
 * screen with no scrolling, and never with its answer until Reveal.
 *
 * Pure display. It knows nothing of the pad or the network, so the same stage
 * can later be drawn on each student's Teams screen (share to stage).
 *
 * Three layouts, picked from the question itself:
 *   - figure options (two or more option pictures): the stem across the top,
 *     the options four across below, as large as the screen allows
 *   - a question picture with text options: words and options on the left,
 *     the picture on the right
 *   - text only: the stem, then the options two by two (one column when long)
 */

import { Box, Chip, Stack, Typography, alpha } from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import { qbSectionLabel } from '@neram/database';
import MathText from '@/components/common/MathText';
import { promptTitle } from '@/lib/pad/client/format';
import type { DeckItem } from '@/lib/qb-present/deck';
import TimerRing from './TimerRing';
import { correctIndexes, optionCounts, optionLetter, type StageView } from './present-model';
import { useFitText } from './useFitText';

export interface StageSolution {
  explanation: string | null;
  imageUrl: string | null;
}

export interface PresentStageProps {
  title: string;
  item: DeckItem;
  /** "12 of 30" */
  position: string;
  view: StageView;
  secondsLeft: number | null;
  showDistribution: boolean;
  /** Shown only after Reveal, when the teacher asks for it. */
  solution: StageSolution | null;
  onZoom: (src: string, label: string) => void;
}

const LONG_OPTION = 60;

function isFigureQuestion(item: DeckItem): boolean {
  return item.options.filter((o) => o.image_url).length >= 2;
}

export default function PresentStage({ title, item, position, view, secondsLeft, showDistribution, solution, onZoom }: PresentStageProps) {
  const figureOptions = isFigureQuestion(item);
  const sideImage = !!item.image_url && !figureOptions;
  const correct = correctIndexes(view);
  const optionCount = item.options.length || item.plan.optionCount || 0;
  const spread = showDistribution && item.plan.type === 'mcq' ? optionCounts(view, optionCount) : null;
  const { boxRef: textBoxRef, refit } = useFitText<HTMLDivElement>(`${item.id}:${view.phase}:${!!solution}`, {
    min: 16,
    max: figureOptions ? 34 : 44,
  });

  const longOptions = item.options.some((o) => (o.text?.length ?? 0) > LONG_OPTION);
  const answerValue =
    view.phase === 'revealed' && item.plan.type !== 'mcq' && view.revealedKeys?.length ? view.revealedKeys.join(' or ') : null;

  return (
    <Box
      component="main"
      aria-label={`${promptTitle({ sequence: 0, label: item.label })}, ${title}`}
      sx={{
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: { xs: 1.5, md: 2 },
        px: { xs: 2, md: 4 },
        pt: { xs: 1.5, md: 2.5 },
        pb: 1,
        bgcolor: 'background.paper',
        color: 'text.primary',
      }}
    >
      {/* Top strip: which question, and how the class is doing. Never a name. */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 0 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ fontWeight: 600 }}>
            {title} · {position}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: 26, md: 34 }, lineHeight: 1.15 }}>
              {promptTitle({ sequence: 0, label: item.label })}
            </Typography>
            {item.section && <Chip label={qbSectionLabel(item.section)} size="small" sx={{ fontWeight: 600 }} />}
            {item.plan.type === 'show' && <Chip label="Discuss" size="small" variant="outlined" />}
          </Stack>
        </Box>

        {view.answered !== null && view.phase !== 'ready' && (
          <Box aria-live="polite" sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: 22, md: 28 }, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {view.answered}
              {view.joined ? <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>{` of ${view.joined}`}</Box> : null}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              answered
            </Typography>
          </Box>
        )}
        {view.phase === 'open' && secondsLeft !== null && <TimerRing secondsLeft={secondsLeft} total={view.timeLimit} />}
        {view.phase === 'closed' && (
          <Chip label="Answers closed" sx={{ fontWeight: 700, bgcolor: 'action.selected' }} />
        )}
      </Stack>

      {/* Body */}
      <Box
        sx={{
          minHeight: 0,
          display: 'grid',
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: sideImage || solution ? { xs: '1fr', md: 'minmax(0, 1.1fr) minmax(0, 1fr)' } : '1fr',
          gridTemplateRows: sideImage || solution ? { xs: 'minmax(0, 1fr) minmax(0, 0.8fr)', md: 'minmax(0, 1fr)' } : 'minmax(0, 1fr)',
        }}
      >
        <Box
          ref={textBoxRef}
          sx={{
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8em',
            fontSize: 'var(--fit, 32px)',
            lineHeight: 1.4,
            // Nothing in here may shrink: the font does, until it all fits.
            '& > *': { flexShrink: 0 },
          }}
        >
          {(item.text || figureOptions) && (
            <Stack direction="row" spacing={3} alignItems="flex-start">
              {item.text && <MathText text={item.text} component="div" sx={{ fontSize: 'inherit', lineHeight: 'inherit', fontWeight: 500, flex: 1 }} />}
              {figureOptions && item.image_url && (
                <StageImage src={item.image_url} label="Question figure" maxHeight="28vh" onZoom={onZoom} onLoad={refit} />
              )}
            </Stack>
          )}

          {item.plan.type === 'show' && item.parts.length > 0 && (
            <Stack spacing="0.4em" component="ol" sx={{ pl: '1.2em', m: 0 }}>
              {item.parts.map((part, i) => (
                <Box component="li" key={i}>
                  {part.label && <strong>{part.label} </strong>}
                  {part.text && <MathText text={part.text} component="span" sx={{ fontSize: 'inherit', display: 'inline' }} />}
                  {part.image_url && <StageImage src={part.image_url} label={`Part ${part.label ?? i + 1}`} maxHeight="22vh" onZoom={onZoom} onLoad={refit} />}
                </Box>
              ))}
            </Stack>
          )}

          {item.options.length > 0 && (
            <Box
              role="list"
              aria-label="Options"
              sx={{
                display: 'grid',
                gap: '0.5em',
                gridTemplateColumns: figureOptions
                  ? `repeat(${Math.min(4, item.options.length)}, minmax(0, 1fr))`
                  : longOptions || sideImage
                    ? '1fr'
                    : 'repeat(2, minmax(0, 1fr))',
                mt: 'auto',
                mb: 'auto',
              }}
            >
              {item.options.map((option, i) => (
                <OptionCard
                  key={i}
                  letter={optionLetter(i)}
                  text={option.text}
                  imageUrl={option.image_url}
                  figure={figureOptions}
                  correct={correct.has(i)}
                  revealed={view.phase === 'revealed' && correct.size > 0}
                  count={spread ? spread.counts[i] : null}
                  total={spread?.total ?? 0}
                  onZoom={onZoom}
                  onLoad={refit}
                />
              ))}
            </Box>
          )}

          {item.options.length === 0 && item.plan.type === 'mcq' && (
            <Typography sx={{ fontSize: '0.7em', color: 'text.secondary' }}>Options are in the picture. Answer A to {optionLetter((item.plan.optionCount ?? 4) - 1)} on the pad.</Typography>
          )}

          {answerValue && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'success.dark', fontWeight: 800 }}>
              <CheckCircleRoundedIcon sx={{ fontSize: '1.2em' }} />
              <span>Answer: {answerValue}</span>
            </Stack>
          )}

          {spread === null && showDistribution && view.distribution && item.plan.type !== 'mcq' && view.distribution.length > 0 && (
            <ValueSpread groups={view.distribution} keys={view.revealedKeys} />
          )}
        </Box>

        {sideImage && !solution && <StageImage src={item.image_url!} label="Question figure" maxHeight="100%" onZoom={onZoom} onLoad={refit} fill />}

        {solution && (
          <Box
            aria-label="Solution"
            sx={{
              minHeight: 0,
              overflow: 'auto',
              borderRadius: 2,
              border: 1,
              borderColor: 'success.light',
              bgcolor: (t) => alpha(t.palette.success.main, 0.06),
              p: 2.5,
            }}
          >
            <Typography sx={{ fontWeight: 800, color: 'success.dark', mb: 1 }}>Solution</Typography>
            {solution.explanation && <MathText text={solution.explanation} sx={{ fontSize: { xs: 16, md: 20 }, lineHeight: 1.5 }} />}
            {solution.imageUrl && (
              <Box sx={{ mt: 1.5 }}>
                <StageImage src={solution.imageUrl} label="Solution figure" maxHeight="50vh" onZoom={onZoom} />
              </Box>
            )}
            {!solution.explanation && !solution.imageUrl && (
              <Typography color="text.secondary">No written solution for this question yet.</Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function StageImage({
  src,
  label,
  maxHeight,
  onZoom,
  onLoad,
  fill,
}: {
  src: string;
  label: string;
  maxHeight: string;
  onZoom: (src: string, label: string) => void;
  onLoad?: () => void;
  fill?: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onZoom(src, label)}
      aria-label={`${label}, open full size`}
      sx={{
        position: 'relative',
        p: 0,
        border: 0,
        bgcolor: '#fff',
        cursor: 'zoom-in',
        borderRadius: 1.5,
        minHeight: 0,
        maxHeight: fill ? '100%' : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        '&:hover .zoom-hint, &:focus-visible .zoom-hint': { opacity: 1 },
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        onLoad={onLoad}
        style={{ maxWidth: '100%', maxHeight, height: fill ? '100%' : 'auto', width: 'auto', objectFit: 'contain', display: 'block' }}
      />
      <Box
        className="zoom-hint"
        aria-hidden
        sx={{ position: 'absolute', right: 6, bottom: 6, opacity: 0, transition: 'opacity 150ms', bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 1, display: 'flex', p: 0.25 }}
      >
        <ZoomInRoundedIcon fontSize="small" />
      </Box>
    </Box>
  );
}

function OptionCard({
  letter,
  text,
  imageUrl,
  figure,
  correct,
  revealed,
  count,
  total,
  onZoom,
  onLoad,
}: {
  letter: string;
  text: string | null;
  imageUrl: string | null;
  figure: boolean;
  correct: boolean;
  revealed: boolean;
  count: number | null;
  total: number;
  onZoom: (src: string, label: string) => void;
  onLoad: () => void;
}) {
  const dim = revealed && !correct;
  const percent = count !== null && total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Box
      role="listitem"
      aria-label={`Option ${letter}${correct ? ', correct answer' : ''}${count !== null ? `, ${count} chose it` : ''}`}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: figure ? 'column' : 'row',
        alignItems: figure ? 'stretch' : 'center',
        gap: '0.5em',
        p: figure ? 1 : '0.35em 0.6em',
        borderRadius: 2,
        border: 2,
        borderColor: correct ? 'success.main' : 'divider',
        bgcolor: (t) => (correct ? alpha(t.palette.success.main, 0.1) : t.palette.background.paper),
        opacity: dim ? 0.55 : 1,
        transition: 'opacity 200ms, border-color 200ms, background-color 200ms',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
        <Box
          aria-hidden
          sx={{
            width: '1.6em',
            height: '1.6em',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: '0.85em',
            bgcolor: correct ? 'success.main' : 'action.selected',
            color: correct ? 'success.contrastText' : 'text.primary',
          }}
        >
          {letter}
        </Box>
        {correct && <CheckCircleRoundedIcon aria-hidden sx={{ color: 'success.main', fontSize: '1em', display: figure ? 'inline-flex' : 'none' }} />}
      </Stack>

      {imageUrl && (
        <StageImage src={imageUrl} label={`Option ${letter}`} maxHeight={figure ? '30vh' : '14vh'} onZoom={onZoom} onLoad={onLoad} />
      )}
      {text && (
        <MathText
          text={text}
          component="div"
          sx={{ fontSize: figure ? '0.75em' : 'inherit', lineHeight: 1.35, minWidth: 0, flex: figure ? undefined : 1 }}
        />
      )}
      {correct && !figure && <CheckCircleRoundedIcon aria-hidden sx={{ color: 'success.main', fontSize: '1.1em', flexShrink: 0 }} />}

      {count !== null && (
        <Box sx={{ position: figure ? 'relative' : 'absolute', left: 0, right: 0, bottom: 0, height: figure ? 'auto' : 6, mt: figure ? 'auto' : 0 }}>
          {figure ? (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ fontSize: '0.6em' }}>
              <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }}>
                <Box sx={{ width: `${percent}%`, height: '100%', bgcolor: correct ? 'success.main' : 'primary.main' }} />
              </Box>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{count}</span>
            </Stack>
          ) : (
            <Box sx={{ width: `${percent}%`, height: '100%', bgcolor: correct ? 'success.main' : 'primary.main', opacity: 0.85 }} />
          )}
        </Box>
      )}
      {count !== null && !figure && (
        <Typography component="span" sx={{ fontSize: '0.6em', fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flexShrink: 0, ml: 'auto' }}>
          {count}
        </Typography>
      )}
    </Box>
  );
}

function ValueSpread({ groups, keys }: { groups: Array<{ value: string; count: number }>; keys: string[] | null }) {
  const top = groups.slice(0, 5);
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  return (
    <Stack spacing="0.3em" aria-label="How the class answered" sx={{ fontSize: '0.6em' }}>
      {top.map((group) => {
        const right = keys?.includes(group.value);
        const percent = total ? Math.round((group.count / total) * 100) : 0;
        return (
          <Stack key={group.value} direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ minWidth: '5em', fontWeight: 700, color: right ? 'success.dark' : 'text.primary' }}>{group.value}</Box>
            <Box sx={{ flex: 1, height: 10, borderRadius: 5, bgcolor: 'action.hover', overflow: 'hidden' }}>
              <Box sx={{ width: `${percent}%`, height: '100%', bgcolor: right ? 'success.main' : 'primary.main' }} />
            </Box>
            <Box sx={{ minWidth: '4em', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{group.count}</Box>
          </Stack>
        );
      })}
    </Stack>
  );
}
