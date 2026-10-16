'use client';

/**
 * Middle pane of Conversations: every question in one chat with Aintra's
 * answer, and the review tools under each: good / wrong, Correct (inline
 * editor with Draft with AI and Add to knowledge base) and AI Review.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@neram/ui';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { alpha } from '@mui/material/styles';
import { OpsSkeleton } from '@/components/ops/OpsUi';
import { parseAnswer, sourceLabel, type AnswerBlock } from '@/lib/aintra-inbox/answer';
import { restatus } from '@/lib/aintra-inbox/build';
import { errorLabel, isCreditsError } from '@/lib/aintra-inbox/status';
import type { AiReview, InboxConversation, InboxTurn } from '@/lib/aintra-inbox/types';
import { chatbotLabel, fmtAgo, fmtDateTime, fmtTime, Pill, sourceLabelOf, StatusPill } from './ui';

export type Notify = (message: string, severity?: 'success' | 'error') => void;

const VERDICT_LABEL: Record<AiReview['verdict'], string> = {
  correct: 'Looks accurate.',
  needs_fix: 'Needs a fix.',
  wrong: 'Likely inaccurate.',
  uncertain: 'Verify the facts.',
};

async function patchTurn(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/chatbot-logs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not save');
  return json.data as {
    thumbs_up: boolean | null;
    admin_correction: string | null;
    corrected_by_name: string | null;
    corrected_at: string | null;
    promoted_to_kb: boolean;
  };
}

async function runReview(id: string): Promise<AiReview> {
  const res = await fetch(`/api/chatbot-logs/${id}/ai-review`, { method: 'POST' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'AI review failed');
  return json as AiReview;
}

function AnswerBody({ blocks, faded }: { blocks: AnswerBlock[]; faded: boolean }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, opacity: faded ? 0.5 : 1 }}>
      {blocks.map((b, i) => {
        if (b.type === 'paragraph')
          return (
            <Typography key={i} sx={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line', textWrap: 'pretty' }}>
              {b.text}
            </Typography>
          );
        if (b.type === 'heading')
          return (
            <Typography key={i} sx={{ fontSize: 14, fontWeight: 700 }}>
              {b.text}
            </Typography>
          );
        if (b.type === 'list')
          return (
            <Box key={i} component={b.ordered ? 'ol' : 'ul'} sx={{ m: 0, pl: 2.5, fontSize: 14, lineHeight: 1.6 }}>
              {b.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </Box>
          );
        if (b.type === 'table')
          return (
            <Box key={i} sx={{ overflowX: 'auto' }}>
              <Box
                component="table"
                sx={{
                  borderCollapse: 'collapse',
                  fontSize: 13,
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  '& th': { textAlign: 'left', px: 1.5, py: 1, bgcolor: 'grey.100', fontWeight: 600 },
                  '& td': { px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' },
                }}
              >
                <thead>
                  <tr>
                    {b.header.map((h, j) => (
                      <th key={j} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((cell, k) => (
                        <td key={k}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Box>
            </Box>
          );
        return (
          <Box key={i}>
            <Pill tone="primary">{b.label}</Pill>
          </Box>
        );
      })}
    </Box>
  );
}

function TurnCard({ turn, onChange, notify }: { turn: InboxTurn; onChange: (t: InboxTurn) => void; notify: Notify }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [addToKb, setAddToKb] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [showAi, setShowAi] = useState(!!turn.aiReview && turn.status === 'review');

  const update = (patch: Partial<InboxTurn>) => onChange(restatus({ ...turn, ...patch }));
  const credits = isCreditsError(turn.error);
  const noAnswer = !turn.answer?.trim();

  const rate = async (value: boolean) => {
    const next = turn.thumbsUp === value ? null : value;
    const prev = turn.thumbsUp;
    update({ thumbsUp: next });
    if (next === false) openEditor();
    try {
      await patchTurn(turn.id, { thumbs_up: next });
    } catch (e) {
      update({ thumbsUp: prev });
      notify(e instanceof Error ? e.message : 'Could not save the rating', 'error');
    }
  };

  function openEditor() {
    setDraft((d) => d || turn.correction || '');
    setEditing(true);
  }

  const review = async (): Promise<AiReview | null> => {
    setReviewing(true);
    try {
      const r = await runReview(turn.id);
      update({ aiReview: r });
      setShowAi(true);
      return r;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'AI review failed', 'error');
      return null;
    } finally {
      setReviewing(false);
    }
  };

  const onAiButton = async () => {
    if (turn.aiReview) setShowAi((v) => !v);
    else await review();
  };

  const draftWithAi = async () => {
    const r = turn.aiReview?.suggestedCorrection ? turn.aiReview : await review();
    if (r?.suggestedCorrection) {
      setDraft(r.suggestedCorrection);
      setShowAi(true);
    }
  };

  const save = async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      const saved = await patchTurn(turn.id, { admin_correction: text });
      let promoted = turn.promotedToKb;
      if (addToKb && !promoted) {
        const kb = await fetch('/api/aintra/kb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: turn.question, answer: text, category: 'General', is_active: true, display_order: 0 }),
        });
        if (kb.ok) {
          await patchTurn(turn.id, { promoted_to_kb: true });
          promoted = true;
        } else {
          notify('Correction saved, but adding it to the knowledge base failed. Try again from Aintra Training.', 'error');
        }
      }
      update({
        correction: saved.admin_correction,
        correctedByName: saved.corrected_by_name,
        correctedAt: saved.corrected_at,
        promotedToKb: promoted,
      });
      setEditing(false);
      if (promoted && addToKb) notify('Correction saved and added to the knowledge base');
      else notify('Correction saved');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save the correction', 'error');
    } finally {
      setSaving(false);
    }
  };

  const blocks = parseAnswer(turn.answer);
  const ai = turn.aiReview;
  const editLabel = noAnswer && !turn.correction ? 'Write answer' : turn.correction ? 'Edit correction' : 'Correct';

  return (
    <Box component="article" aria-label={`Question at ${fmtTime(turn.at)}`} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 2.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
          <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', letterSpacing: '0.04em' }}>
            USER QUESTION · {fmtDateTime(turn.at)}
          </Typography>
          <Typography component="h4" sx={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
            {turn.question}
          </Typography>
        </Box>
        <StatusPill status={turn.status} credits={credits} />
      </Box>

      {turn.error && noAnswer && (
        <Box sx={{ bgcolor: (t) => alpha(t.palette.error.main, 0.08), borderRadius: 2.5, px: 2, py: 1.75 }}>
          <Typography sx={{ fontWeight: 600, color: 'error.dark' }}>No answer delivered: {errorLabel(turn.error)}</Typography>
          <Typography sx={{ fontSize: 13, color: 'error.dark', mt: 0.5 }}>
            This person left without a reply. Write one below and save it to the knowledge base so Aintra answers it next time.
          </Typography>
        </Box>
      )}

      {!noAnswer && (
        <Box
          sx={{
            bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
            border: 1,
            borderColor: (t) => alpha(t.palette.primary.main, 0.15),
            borderRadius: 2.5,
            px: 2,
            py: 1.75,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', fontSize: 12, fontWeight: 600 }}>
            <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: 'primary.main', letterSpacing: '0.04em' }}>
              AINTRA&apos;S ANSWER
            </Typography>
            <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
              Source: {sourceLabel(turn.tools)}
              {turn.model ? ` · ${turn.model}` : ''}
              {turn.responseMs ? ` · ${(turn.responseMs / 1000).toFixed(1)} s` : ''}
            </Typography>
          </Box>
          <AnswerBody blocks={blocks} faded={!!turn.correction} />
          {turn.error && (
            <Typography sx={{ fontSize: 12, color: 'warning.dark' }}>Delivered with a problem: {errorLabel(turn.error)}.</Typography>
          )}
        </Box>
      )}

      {turn.correction && !editing && (
        <Box
          sx={{
            bgcolor: (t) => alpha(t.palette.success.main, 0.08),
            border: 1,
            borderColor: (t) => alpha(t.palette.success.main, 0.3),
            borderRadius: 2.5,
            px: 2,
            py: 1.75,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: 'success.dark', letterSpacing: '0.04em' }}>
              CORRECTED ANSWER{turn.promotedToKb ? ' · SAVED TO KNOWLEDGE BASE' : ''}
            </Typography>
            {(turn.correctedByName || turn.correctedAt) && (
              <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                {[turn.correctedByName ? `by ${turn.correctedByName}` : null, turn.correctedAt ? fmtAgo(turn.correctedAt) : null].filter(Boolean).join(', ')}
              </Typography>
            )}
          </Box>
          <Typography sx={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{turn.correction}</Typography>
        </Box>
      )}

      {showAi && ai && (
        <Box
          role="note"
          sx={{
            display: 'flex',
            gap: 1.25,
            alignItems: 'flex-start',
            fontSize: 13,
            px: 1.75,
            py: 1.25,
            borderRadius: 2.5,
            bgcolor: (t) => alpha(t.palette.warning.main, 0.1),
            color: 'text.primary',
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 16, color: 'warning.dark', mt: '2px' }} aria-hidden />
          <Typography component="span" sx={{ fontSize: 13 }}>
            <Box component="b" sx={{ color: 'warning.dark' }}>
              AI Review:
            </Box>{' '}
            {ai.drafted ? 'No answer was generated. A suggested reply is ready under Draft with AI.' : VERDICT_LABEL[ai.verdict]} {ai.reasoning}
          </Typography>
        </Box>
      )}

      {editing ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 0.5 }}>
          <TextField
            multiline
            minRows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            label="Better / corrected answer"
            autoFocus
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button onClick={() => setEditing(false)} sx={{ minHeight: 44 }}>
              Close
            </Button>
            <Button
              onClick={draftWithAi}
              disabled={reviewing}
              startIcon={reviewing ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
              sx={{ minHeight: 44, color: 'warning.dark' }}
            >
              Draft with AI
            </Button>
            <FormControlLabel
              sx={{ ml: 'auto', mr: 0, '& .MuiFormControlLabel-label': { fontSize: 13, color: 'text.secondary' } }}
              control={
                <Checkbox
                  checked={addToKb || turn.promotedToKb}
                  disabled={turn.promotedToKb}
                  onChange={(e) => setAddToKb(e.target.checked)}
                />
              }
              label={turn.promotedToKb ? 'Already in knowledge base' : 'Add to knowledge base'}
            />
            <Button
              variant="contained"
              onClick={save}
              disabled={!draft.trim() || saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ minHeight: 44 }}
            >
              Save correction
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          {!noAnswer && (
            <>
              <Tooltip title="Good answer">
                <IconButton
                  aria-label="Good answer"
                  aria-pressed={turn.thumbsUp === true}
                  onClick={() => rate(true)}
                  sx={{
                    width: 44,
                    height: 44,
                    color: turn.thumbsUp === true ? 'success.contrastText' : 'text.secondary',
                    bgcolor: turn.thumbsUp === true ? 'success.main' : 'grey.100',
                    '&:hover': { bgcolor: turn.thumbsUp === true ? 'success.dark' : 'grey.200' },
                  }}
                >
                  <ThumbUpOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Wrong answer">
                <IconButton
                  aria-label="Wrong answer"
                  aria-pressed={turn.thumbsUp === false}
                  onClick={() => rate(false)}
                  sx={{
                    width: 44,
                    height: 44,
                    color: turn.thumbsUp === false ? 'error.contrastText' : 'text.secondary',
                    bgcolor: turn.thumbsUp === false ? 'error.main' : 'grey.100',
                    '&:hover': { bgcolor: turn.thumbsUp === false ? 'error.dark' : 'grey.200' },
                  }}
                >
                  <ThumbDownOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Box aria-hidden sx={{ width: '1px', height: 22, bgcolor: 'divider', mx: 0.75 }} />
            </>
          )}
          <Button variant="outlined" size="small" startIcon={<EditOutlinedIcon />} onClick={openEditor} sx={{ minHeight: 44, borderRadius: 5 }}>
            {editLabel}
          </Button>
          <Button
            size="small"
            onClick={onAiButton}
            disabled={reviewing}
            startIcon={reviewing ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
            sx={{ minHeight: 44, borderRadius: 5, color: 'warning.dark' }}
          >
            {ai && showAi ? 'Hide AI Review' : 'AI Review'}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default function Transcript({
  conversation,
  turns,
  loading,
  error,
  onTurnChange,
  notify,
  onShowPerson,
  onBack,
}: {
  conversation: InboxConversation | null;
  turns: InboxTurn[] | null;
  loading: boolean;
  error: string | null;
  onTurnChange: (t: InboxTurn) => void;
  notify: Notify;
  /** Shown when the person panel is in a drawer (narrower screens). */
  onShowPerson?: () => void;
  /** Shown when the list and the transcript are stacked (narrow screens). */
  onBack?: () => void;
}) {
  // A different chat starts with the scroll at the top.
  const [scrollKey, setScrollKey] = useState(conversation?.id);
  useEffect(() => setScrollKey(conversation?.id), [conversation?.id]);

  const c = conversation;
  const headerMeta = c
    ? [c.place ?? 'Unknown location', `via ${c.channel ? sourceLabelOf(c.channel) : chatbotLabel(c.source)}`, c.isGuest ? 'No contact details' : c.phone ?? 'No phone on file']
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <Box
      component="section"
      aria-label="Transcript"
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, height: '100%', bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}
    >
      {onBack && (
        <Box sx={{ px: 1, pt: 1 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ minHeight: 44 }}>
            All conversations
          </Button>
        </Box>
      )}
      {c ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
              <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
                {c.isGuest ? `Guest ${c.guestTag ?? ''}` : c.name}
              </Typography>
              {c.isGuest ? <Pill>Guest</Pill> : <Pill tone="primary">Signed in</Pill>}
            </Box>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>{headerMeta}</Typography>
          </Box>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {c.turnCount} {c.turnCount === 1 ? 'question' : 'questions'}
          </Typography>
          {onShowPerson && (
            <Button variant="outlined" size="small" startIcon={<PersonOutlineIcon />} onClick={onShowPerson} sx={{ minHeight: 44 }}>
              Profile
            </Button>
          )}
        </Box>
      ) : null}

      <Box key={scrollKey} sx={{ flex: 1, overflow: 'auto', px: 3, pb: 4, pt: 0.5, minHeight: 0 }}>
        {!c && !loading && (
          <Typography sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>Pick a conversation to read it.</Typography>
        )}
        {loading &&
          Array.from({ length: 2 }, (_, i) => (
            <Box key={i} sx={{ py: 2.5 }}>
              <OpsSkeleton width="30%" />
              <OpsSkeleton width="70%" height={28} />
              <OpsSkeleton variant="rounded" height={120} sx={{ mt: 1.5 }} />
            </Box>
          ))}
        {error && !loading && <Typography sx={{ py: 4, color: 'error.main' }}>{error}</Typography>}
        {!loading && !error && turns?.map((t) => <TurnCard key={t.id} turn={t} onChange={onTurnChange} notify={notify} />)}
      </Box>
    </Box>
  );
}
