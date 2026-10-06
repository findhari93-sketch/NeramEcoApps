'use client';

/**
 * One recommendation, in a side drawer: what the data shows (observed), what
 * the AI thinks (interpretation, labelled as such), the exact change, and the
 * decision buttons. Every live change and undo goes through ConfirmDialog.
 * Opened from the Recommendations list; ?id= keeps it linkable. Close returns
 * to the list with the same filters.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Divider, Drawer, IconButton, Paper, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import TimelineIcon from '@mui/icons-material/Timeline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import HistoryIcon from '@mui/icons-material/History';
import { OpsSkeleton, StatusChip, TARGET_44 } from '@/components/ops/OpsUi';
import { ConfirmDialog, EvidenceTable } from './Parts';
import { api, CATEGORY_LABEL, describeChange, EXECUTABLE, inr, INTENT_LABEL, num, PRIORITY_TONE, STATUS_LABEL, when } from './format';

/**
 * The AI-written ad, laid out roughly as Google shows it (three headlines, two
 * descriptions; Google mixes the rest), then every asset with its length. It is
 * labelled as AI-written so nobody mistakes it for a live ad.
 */
function AdPreview({ change }: { change: { headlines: string[]; descriptions: string[]; final_urls: string[] } }) {
  let host = '';
  try {
    host = new URL(change.final_urls[0]).hostname.replace(/^www\./, '');
  } catch {
    /* no url */
  }
  return (
    <Box sx={{ mt: 1, display: 'grid', gap: 1 }}>
      <Paper variant="outlined" sx={{ p: 1.5 }} aria-label="Preview of the AI-written ad">
        <Typography variant="caption" color="text.secondary">
          Sponsored, {host}
        </Typography>
        <Typography variant="subtitle1" color="primary.main" fontWeight={600} sx={{ lineHeight: 1.3, wordBreak: 'break-word' }}>
          {change.headlines.slice(0, 3).join(' | ')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {change.descriptions.slice(0, 2).join(' ')}
        </Typography>
      </Paper>
      <Typography variant="caption" color="text.secondary">
        Written by the AI. Google checks every new ad against its policies before showing it.
      </Typography>
      <Box component="details">
        <Typography component="summary" variant="body2" sx={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
          All {change.headlines.length} headlines and {change.descriptions.length} descriptions
        </Typography>
        <Box component="ul" sx={{ pl: 2.5, my: 0.5 }}>
          {change.headlines.map((h) => (
            <Typography component="li" variant="body2" key={`h${h}`}>
              {h} <Typography component="span" variant="caption" color="text.secondary">({h.length}/30)</Typography>
            </Typography>
          ))}
          {change.descriptions.map((d) => (
            <Typography component="li" variant="body2" key={`d${d}`}>
              {d} <Typography component="span" variant="caption" color="text.secondary">({d.length}/90)</Typography>
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/** A keyword bid change: the bid now, the new bid, and what Google says the first page costs. */
function BidPreview({ change, facts }: { change: { from_micros: number; to_micros: number; text: string }; facts: Record<string, any> }) {
  const cells: Array<[string, string]> = [
    ['Max CPC now', inr(change.from_micros / 1e6, 2)],
    ['New max CPC', inr(change.to_micros / 1e6, 2)],
    ['First-page bid', facts.first_page_bid_inr == null ? 'not reported' : inr(facts.first_page_bid_inr, 2)],
    ['Quality Score', facts.quality_score == null ? 'not reported' : `${facts.quality_score}/10`],
  ];
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mt: 1 }} aria-label={`Bid change for ${change.text}`}>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        {cells.map(([label, value], i) => (
          <Box key={label}>
            <Typography component="dt" variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography component="dd" variant="body1" fontWeight={i === 1 ? 700 : 500} sx={{ m: 0 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

type Confirm = null |'approve_apply' | 'approve' | 'apply' | 'reject' | { undo: string };

export default function RecommendationDrawer({
  id,
  connection,
  onClose,
  onChanged,
}: {
  id: string | null;
  connection: { mode: 'mock' | 'live'; mutationsAllowed: boolean } | null;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    api(`/api/marketing-ai/recommendations/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const rec = data?.recommendation;
  const executable = rec && EXECUTABLE.includes(rec.category);
  const change = rec ? describeChange(rec.proposed_change) : null;
  const intent = rec?.ai_intent ? INTENT_LABEL[rec.ai_intent] : null;
  const status = rec ? STATUS_LABEL[rec.status] ?? { label: rec.status, tone: 'neutral' as const } : null;

  const liveNote =
    connection?.mode === 'mock'
      ? 'This is the sample account, so nothing real changes.'
      : connection?.mutationsAllowed
        ? 'This changes the live Google Ads account. It can be undone afterwards.'
        : 'Live changes are off in this environment, so Google will only check the change (a dry run).';

  const done = (message: string) => {
    setConfirm(null);
    onChanged(message);
    load();
  };

  const runApply = async (path: string, body?: object) => {
    const r = await api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
    const outcome = r.execution ?? r;
    if (outcome?.status === 'failed') throw new Error(outcome.message);
    done(outcome?.message ?? 'Approved.');
  };

  return (
    <Drawer anchor="right" open={!!id} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 600 } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle1" component="h2" fontWeight={700}>
          Recommendation
        </Typography>
        <IconButton onClick={onClose} aria-label="Close and go back to the list" sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 2, display: 'grid', gap: 2.5, overflowY: 'auto' }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!rec && !error && (
          <>
            <OpsSkeleton variant="text" height={40} />
            <OpsSkeleton variant="rounded" height={160} />
            <OpsSkeleton variant="rounded" height={120} />
          </>
        )}

        {rec && (
          <>
            <Box>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
                <StatusChip icon={FlagOutlinedIcon} tone={PRIORITY_TONE[rec.priority]} label={`${rec.priority} priority`} />
                <StatusChip icon={CategoryOutlinedIcon} label={CATEGORY_LABEL[rec.category] ?? rec.category} />
                <StatusChip icon={TimelineIcon} tone={status!.tone} label={status!.label} />
                <StatusChip icon={ShieldOutlinedIcon} tone={rec.risk_level === 'high' ? 'error' : rec.risk_level === 'medium' ? 'warning' : 'neutral'} label={`${rec.risk_level} risk`} />
              </Box>
              <Typography variant="h6" component="p" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
                {rec.title}
              </Typography>
            </Box>

            <Box component="section" aria-labelledby="mi-observed">
              <Typography id="mi-observed" variant="overline" color="text.secondary" fontWeight={700}>
                What the data shows
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {rec.reason}
              </Typography>
              {rec.evidence?.proxy && (
                <Alert severity="info" icon={<HistoryIcon fontSize="inherit" />} sx={{ mb: 1 }}>
                  Based on last season&apos;s conversions. These were counted by the old Sign-up goal, before OTP sign-ups were tracked, so the agent never applies this by itself.
                </Alert>
              )}
              <EvidenceTable evidence={rec.evidence} />
            </Box>

            <Box component="section" aria-labelledby="mi-ai">
              <Typography id="mi-ai" variant="overline" color="text.secondary" fontWeight={700}>
                AI assessment
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.5, borderStyle: 'dashed', bgcolor: 'action.hover' }}>
                {intent && (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                    <StatusChip icon={SmartToyOutlinedIcon} tone={intent.tone} label={intent.label} />
                    {rec.confidence !== null && (
                      <Typography variant="caption" color="text.secondary">
                        {Math.round(rec.confidence * 100)}% confident
                      </Typography>
                    )}
                  </Box>
                )}
                <Typography variant="body2">{rec.ai_assessment || 'No AI assessment for this one. The recommendation comes from the rules alone.'}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  An interpretation, not data. Numbers it quotes were checked against the table above.
                </Typography>
              </Paper>
            </Box>

            {change && (
              <Box component="section" aria-labelledby="mi-change">
                <Typography id="mi-change" variant="overline" color="text.secondary" fontWeight={700}>
                  Proposed change
                </Typography>
                <Typography variant="body2">{change}</Typography>
                {rec.proposed_change?.kind === 'new_ad' && rec.proposed_change.headlines?.length > 0 && <AdPreview change={rec.proposed_change} />}
                {rec.proposed_change?.kind === 'add_keyword' && (
                  <Paper variant="outlined" sx={{ p: 1.5, mt: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="body2" color="text.secondary">New keyword:</Typography>
                    <Typography variant="body1" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                      {rec.proposed_change.match_type === 'EXACT' ? `[${rec.proposed_change.text}]` : `"${rec.proposed_change.text}"`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{rec.proposed_change.match_type === 'EXACT' ? 'Exact match' : 'Phrase match'}</Typography>
                  </Paper>
                )}
                {rec.proposed_change?.kind === 'keyword_bid' && <BidPreview change={rec.proposed_change} facts={rec.evidence?.facts ?? {}} />}
                {rec.proposed_change?.kind === 'ad_schedule' && (
                  <Box component="ul" sx={{ pl: 2.5, my: 1 }}>
                    {rec.proposed_change.slots.map((sl: any) => (
                      <Typography component="li" variant="body2" key={`${sl.day}${sl.part}`}>
                        {sl.day}, {sl.part}: {inr(sl.cost)} for {num(sl.conversions, 1)} sign-ups
                      </Typography>
                    ))}
                  </Box>
                )}
                {rec.estimated_impact && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Expected effect: {rec.estimated_impact}
                  </Typography>
                )}
              </Box>
            )}

            {rec.execution_result?.error && <Alert severity="error">Last attempt failed: {rec.execution_result.error}</Alert>}
            {rec.measured_result && (
              <Alert severity={rec.measured_result.cpa_change_pct > 0 ? 'warning' : 'success'}>
                A week later, cost per conversion on this campaign changed by {rec.measured_result.cpa_change_pct ?? 'n/a'}%.
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {rec.status === 'pending_approval' && executable && (
                <>
                  <Button variant="contained" sx={TARGET_44} onClick={() => setConfirm('approve_apply')}>
                    Approve and apply
                  </Button>
                  <Button variant="outlined" sx={TARGET_44} onClick={() => setConfirm('approve')}>
                    Approve only
                  </Button>
                </>
              )}
              {rec.status === 'pending_approval' && !executable && (
                <Button variant="contained" sx={TARGET_44} onClick={() => setConfirm('approve')}>
                  {rec.category === 'alert' || rec.category === 'insight' ? 'Mark as handled' : 'Done it in Google Ads'}
                </Button>
              )}
              {['approved', 'failed'].includes(rec.status) && executable && (
                <Button variant="contained" sx={TARGET_44} onClick={() => setConfirm('apply')}>
                  {rec.status === 'failed' ? 'Try again' : 'Apply now'}
                </Button>
              )}
              {['pending_approval', 'approved', 'failed'].includes(rec.status) && (
                <Button color="error" sx={TARGET_44} onClick={() => setConfirm('reject')}>
                  Reject
                </Button>
              )}
              {data.actions
                .filter((a: any) => a.can_undo)
                .map((a: any) => (
                  <Button key={a.id} startIcon={<UndoIcon />} color="warning" variant="outlined" sx={TARGET_44} onClick={() => setConfirm({ undo: a.id })}>
                    Undo this change
                  </Button>
                ))}
            </Box>

            <Divider />
            <Box component="section" aria-labelledby="mi-history">
              <Typography id="mi-history" variant="overline" color="text.secondary" fontWeight={700}>
                History
              </Typography>
              <Box component="ol" sx={{ pl: 2.5, my: 0.5 }}>
                <Typography component="li" variant="body2" color="text.secondary">
                  {when(rec.created_at)}: raised by the agent (rule {rec.rule_id})
                </Typography>
                {data.audit.map((e: any) => (
                  <Typography component="li" variant="body2" color="text.secondary" key={e.id} sx={{ wordBreak: 'break-word' }}>
                    {when(e.created_at)}: {e.event.replace(/[._]/g, ' ')} by {e.actor_type === 'admin' ? 'an admin' : e.actor_type}
                    {e.reason && e.reason !== rec.title ? `. ${e.reason}` : ''}
                  </Typography>
                ))}
              </Box>
            </Box>
          </>
        )}
      </Box>

      {rec && (
        <>
          <ConfirmDialog
            open={confirm === 'approve_apply' || confirm === 'apply'}
            title={confirm === 'apply' ? 'Apply this change?' : 'Approve and apply this change?'}
            body={
              <>
                <Typography variant="body2" sx={{ mb: 1 }}>{change}</Typography>
                <Typography variant="body2" color="text.secondary">{liveNote} The agent first checks that the campaign has not changed since the recommendation.</Typography>
              </>
            }
            confirmLabel="Apply"
            onCancel={() => setConfirm(null)}
            onConfirm={() =>
              confirm === 'apply' ? runApply(`/api/marketing-ai/recommendations/${rec.id}/execute`) : runApply(`/api/marketing-ai/recommendations/${rec.id}/approve`, { execute: true })
            }
          />
          <ConfirmDialog
            open={confirm === 'approve'}
            title="Approve without applying?"
            body={<Typography variant="body2">{executable ? 'It stays approved until someone presses Apply now. Nothing changes in Google Ads yet.' : 'This is recorded as accepted. Make the change in Google Ads yourself.'} Your decision also counts towards this category earning automatic mode.</Typography>}
            confirmLabel="Approve"
            withNote
            onCancel={() => setConfirm(null)}
            onConfirm={(note) => runApply(`/api/marketing-ai/recommendations/${rec.id}/approve`, { note: note || undefined })}
          />
          <ConfirmDialog
            open={confirm === 'reject'}
            title="Reject this recommendation?"
            body={<Typography variant="body2">The agent will not raise it again for 30 days. A reason helps it learn what Neram does not want.</Typography>}
            confirmLabel="Reject"
            tone="error"
            withNote
            notePlaceholder="For example: free seekers often join our paid course later"
            onCancel={() => setConfirm(null)}
            onConfirm={async (note) => {
              await api(`/api/marketing-ai/recommendations/${rec.id}/reject`, { method: 'POST', body: JSON.stringify({ note: note || undefined }) });
              done('Rejected.');
            }}
          />
          <ConfirmDialog
            open={typeof confirm === 'object' && confirm !== null}
            title="Undo this change?"
            body={<Typography variant="body2">This puts Google Ads back the way it was before the change. {liveNote}</Typography>}
            confirmLabel="Undo"
            tone="warning"
            onCancel={() => setConfirm(null)}
            onConfirm={async () => {
              const r = await api(`/api/marketing-ai/actions/${(confirm as { undo: string }).undo}/revert`, { method: 'POST' });
              if (r.status === 'failed') throw new Error(r.message);
              done(r.message);
            }}
          />
        </>
      )}
    </Drawer>
  );
}
