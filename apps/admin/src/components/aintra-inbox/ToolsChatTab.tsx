'use client';

/**
 * Tools chat: what students ask Aintra (Tools app), the chat in the Tools app
 * (app.neramclasses.com/ask). Totals for the range, which tools it used and
 * where it could not answer, and every conversation with its transcript.
 * Feeds FAQ and SEO work: the questions students type are the searches they
 * make. Loads from /api/aintra-inbox/tools-chat only when the tab is opened.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { EmptyState, OpsSkeleton, TARGET_44 } from '@/components/ops/OpsUi';
import { toolLabel, type ToolsChatThread, type ToolsChatView } from '@/lib/tools-chat/build';
import { Pill, StatCard, fmtAgo, fmtDateTime } from './ui';

type Range = '7' | '30' | '180' | 'all';
type Filter = 'all' | 'signed-in' | 'guests' | 'gated' | 'failed';

interface Person {
  name: string | null;
  phone: string | null;
  email: string | null;
  enrolled: boolean;
}

interface Payload extends ToolsChatView {
  people: Record<string, Person>;
  truncated: boolean;
  generatedAt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: Array<{ kind?: string; data?: Record<string, unknown> }>;
  tool_calls: Array<{ name: string; ok: boolean; ms?: number }> | null;
  error: string | null;
  response_ms: number | null;
  created_at: string;
}

const RANGE_LABELS: Record<Range, string> = { '7': '7 days', '30': '30 days', '180': '6 months', all: 'All time' };
const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  'signed-in': 'Signed in',
  guests: 'Guests',
  gated: 'Asked to sign in',
  failed: 'Failed answers',
};
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';

const matches = (t: ToolsChatThread, f: Filter) =>
  f === 'all' ? true : f === 'signed-in' ? !!t.userId : f === 'guests' ? !t.userId : f === 'gated' ? t.gated > 0 : t.failed > 0;

/** One line per card, the way staff read it. */
function cardLine(c: Message['cards'][number]): string {
  const d = c.data ?? {};
  switch (c.kind) {
    case 'cutoff':
      return `Cutoff ${d.total}/400 (board ${d.board200} + NATA ${d.nata})`;
    case 'colleges': {
      const counts = (d.counts ?? {}) as Record<string, number>;
      return `${d.system} ${d.year} colleges for ${d.studentValue} (${d.category}): ${counts.safe ?? 0} safe, ${counts.target ?? 0} target, ${counts.reach ?? 0} reach`;
    }
    case 'rank':
      return `${d.system} rank ${d.bestRank} to ${d.worstRank}`;
    case 'centres':
      return `Test cities near ${d.place}`;
    case 'coa':
      return `COA check: "${d.query}"`;
    case 'cost':
      return `Cost Rs ${d.totalMin} to ${d.totalMax}`;
    case 'eligibility':
      return `Eligibility: NATA ${d.nataEligible ? 'yes' : 'no'}`;
    case 'dates':
      return d.announced ? 'NATA dates' : `NATA ${d.cycleYear} dates not announced`;
    case 'tool':
      return `Link: ${d.title}`;
    case 'account':
      // Stored redacted: only the card's type, never links or figures.
      return `Account card (${String(d.kind ?? 'details')})`;
    default:
      return c.kind ?? 'Card';
  }
}

function Bars({ rows }: { rows: Array<{ label: string; value: number; note?: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Nothing in this range yet.</Typography>;
  return (
    <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {rows.map((r) => (
        <Box component="li" key={r.label} aria-label={`${r.label}: ${r.value}`}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: 14 }}>
            <Typography component="span" sx={{ fontSize: 14, fontWeight: 500 }}>
              {r.label}
            </Typography>
            <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {r.value}
              {r.note && (
                <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', ml: 0.75 }}>
                  {r.note}
                </Typography>
              )}
            </Typography>
          </Box>
          <Box sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: 'grey.100', overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${Math.max(2, (r.value / max) * 100)}%`, bgcolor: 'primary.main', borderRadius: 3 }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function ThreadTranscript({ thread, person }: { thread: ToolsChatThread; person: Person | null }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setError(null);
    fetch(`/api/aintra-inbox/tools-chat?thread=${thread.id}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Could not load the chat');
        if (!cancelled) setMessages(json.messages as Message[]);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the chat'));
    return () => {
      cancelled = true;
    };
  }, [thread.id]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-start', mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" sx={{ fontWeight: 700, fontSize: 16 }}>
            {person?.name ?? (thread.userId ? 'Signed-in student' : 'Guest')}
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            {[person?.phone, person?.email, person?.enrolled ? 'Enrolled' : null].filter(Boolean).join(' · ') ||
              (thread.anonId ? `Visitor ${thread.anonId.slice(5, 13)}` : '')}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', flexShrink: 0 }}>{fmtDateTime(thread.startedAt)}</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {!messages && !error && (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <OpsSkeleton variant="rounded" height={48} />
          <OpsSkeleton variant="rounded" height={96} />
          <OpsSkeleton variant="rounded" height={48} />
        </Box>
      )}
      {messages && (
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.5 }}>
          {messages.map((m) => (
            <Box
              component="li"
              key={m.id}
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: m.role === 'user' ? 'grey.50' : 'background.paper',
                border: '1px solid',
                borderColor: m.error ? 'error.light' : 'divider',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
                  {m.role === 'user' ? 'Student' : 'Aintra'}
                  {m.response_ms ? ` · ${(m.response_ms / 1000).toFixed(1)}s` : ''}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{fmtDateTime(m.created_at)}</Typography>
              </Box>
              {m.text && <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.text}</Typography>}
              {m.error && (
                <Pill tone={m.error === 'SIGNUP_REQUIRED' ? 'warning' : 'error'} sx={{ mt: 0.75 }}>
                  {m.error === 'SIGNUP_REQUIRED' ? 'Asked to sign in (not answered)' : `Failed: ${m.error}`}
                </Pill>
              )}
              {m.cards?.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, display: 'grid', gap: 0.25 }}>
                  {m.cards.map((c, i) => (
                    <Typography component="li" key={i} sx={{ fontSize: 13 }}>
                      {cardLine(c)}
                    </Typography>
                  ))}
                </Box>
              )}
              {m.tool_calls && m.tool_calls.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {m.tool_calls.map((t, i) => (
                    <Pill key={i} tone={t.ok ? 'neutral' : 'error'}>
                      {toolLabel(t.name)}
                      {t.ok ? '' : ': no answer'}
                    </Pill>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}

export default function ToolsChatTab() {
  const [range, setRange] = useState<Range>('30');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (r: Range) => {
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/aintra-inbox/tools-chat?range=${r}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load Tools chat');
      setData(json as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Tools chat');
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const threads = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.threads.filter(
      (t) => matches(t, filter) && (!q || `${t.firstQuestion} ${t.lastQuestion}`.toLowerCase().includes(q))
    );
  }, [data, filter, query]);

  const thread = threads.find((t) => t.id === selected) ?? null;
  const s = data?.stats;

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 680 }}>
          What students ask Aintra in the Tools app (app.neramclasses.com/ask). Their questions are the searches they make, so this is where FAQ and page ideas come
          from.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <Chip
              key={r}
              label={RANGE_LABELS[r]}
              color={range === r ? 'primary' : 'default'}
              variant={range === r ? 'filled' : 'outlined'}
              onClick={() => setRange(r)}
              sx={{ ...TARGET_44 }}
            />
          ))}
          <Button
            component="a"
            href={`${APP_URL}/ask`}
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<OpenInNewIcon />}
            sx={{ ...TARGET_44, textTransform: 'none' }}
          >
            Open the chat
          </Button>
        </Box>
      </Box>

      {error && (
        <EmptyState icon={AutoAwesomeOutlinedIcon} title="No Tools chat data" body={error} action={<Button onClick={() => load(range)}>Try again</Button>} />
      )}

      {!error && (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {s ? (
            <>
              <StatCard label="Conversations" value={s.threads} note={`${s.signedInThreads} signed in, ${s.guestThreads} guests`} tone="primary" />
              <StatCard label="Questions" value={s.questions} note={`${s.answers} answered`} />
              <StatCard label="Asked to sign in" value={s.gatedQuestions} note="Guests past 3 free answers a day" />
              <StatCard label="Failed answers" value={s.failedAnswers} note="AI down, budget cap or an empty reply" tone={s.failedAnswers ? 'error' : undefined} />
              <StatCard label="Typical answer time" value={s.medianMs != null ? `${(s.medianMs / 1000).toFixed(1)}s` : 'n/a'} note="Median, whole answer" />
            </>
          ) : (
            [0, 1, 2, 3, 4].map((i) => <OpsSkeleton key={i} variant="rounded" height={96} />)
          )}
        </Box>
      )}

      {data?.truncated && (
        <Alert severity="info">Showing the latest 5,000 messages in this range. Pick a shorter range to see everything in it.</Alert>
      )}

      {!error && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(360px, 440px) 1fr' }, alignItems: 'start' }}>
          <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
                <Chip
                  key={f}
                  label={FILTER_LABELS[f]}
                  size="small"
                  color={filter === f ? 'primary' : 'default'}
                  variant={filter === f ? 'filled' : 'outlined'}
                  onClick={() => setFilter(f)}
                  sx={{ minHeight: 36 }}
                />
              ))}
            </Box>
            <TextField size="small" placeholder="Search questions" value={query} onChange={(e) => setQuery(e.target.value)} inputProps={{ 'aria-label': 'Search questions' }} />
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              {!data &&
                [0, 1, 2, 3].map((i) => (
                  <Box key={i} sx={{ p: 1.5 }}>
                    <OpsSkeleton variant="text" width="80%" />
                    <OpsSkeleton variant="text" width="40%" />
                  </Box>
                ))}
              {data && threads.length === 0 && (
                <Typography sx={{ p: 2, fontSize: 14, color: 'text.secondary' }}>No conversations match.</Typography>
              )}
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, maxHeight: 640, overflowY: 'auto' }}>
                {threads.map((t) => {
                  const person = t.userId ? data?.people[t.userId] : null;
                  return (
                    <Box component="li" key={t.id} sx={{ borderTop: '1px solid', borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => setSelected(t.id)}
                        aria-current={selected === t.id}
                        sx={{
                          all: 'unset',
                          boxSizing: 'border-box',
                          display: 'block',
                          width: '100%',
                          p: 1.5,
                          cursor: 'pointer',
                          bgcolor: selected === t.id ? 'action.selected' : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' },
                          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                        }}
                      >
                        <Typography sx={{ fontSize: 14, fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {t.firstQuestion || '(no question)'}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', mt: 0.5 }}>
                          <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', mr: 0.5 }}>
                            {person?.name ?? (t.userId ? 'Signed in' : 'Guest')} · {t.questions} question{t.questions === 1 ? '' : 's'} · {fmtAgo(t.lastAt)}
                          </Typography>
                          {t.gated > 0 && <Pill tone="warning">Sign-in gate</Pill>}
                          {t.failed > 0 && <Pill tone="error">{t.failed} failed</Pill>}
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Paper>
            {data && (
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr' } }}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography component="h3" sx={{ fontWeight: 700, fontSize: 14, mb: 1.5 }}>
                    Tools it used
                  </Typography>
                  <Bars rows={data.tools.map((t) => ({ label: toolLabel(t.name), value: t.calls, note: t.failed ? `${t.failed} no answer` : undefined }))} />
                </Paper>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography component="h3" sx={{ fontWeight: 700, fontSize: 14, mb: 0.5 }}>
                    Where it could not answer
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1.5 }}>
                    Usually a missing detail (marks, rank) or no data for that system. Each one is a question worth a clearer prompt or page.
                  </Typography>
                  <Bars rows={data.missing.map((m) => ({ label: toolLabel(m.name), value: m.count }))} />
                </Paper>
              </Box>
            )}
          </Box>

          <Box sx={{ minWidth: 0, position: { lg: 'sticky' }, top: { lg: 16 } }}>
            {thread ? (
              <ThreadTranscript thread={thread} person={thread.userId ? data?.people[thread.userId] ?? null : null} />
            ) : (
              <EmptyState icon={ForumOutlinedIcon} title="Pick a conversation" body="Its questions, the answers, the cards shown and the tools used appear here." />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
