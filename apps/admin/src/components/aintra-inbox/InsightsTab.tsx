'use client';

/**
 * Insights: who chats with Aintra, where they come from, what they want, and
 * which questions it answers badly. Worked out in the browser from the loaded
 * conversations, so switching the range is instant.
 */
import { useMemo, useState } from 'react';
import { Box, Button, Chip, Paper, Typography } from '@neram/ui';
import ClearIcon from '@mui/icons-material/Clear';
import IndiaStateMap from '@/components/chat-history/IndiaStateMap';
import { OpsSkeleton } from '@/components/ops/OpsUi';
import { buildInsights, RANGE_LABELS, type Bar, type InsightRange } from '@/lib/aintra-inbox/insights';
import type { InboxConversation, InboxPerson } from '@/lib/aintra-inbox/types';
import { Pill, StatCard } from './ui';

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function Bars({ rows, total, unit }: { rows: Bar[]; total: number; unit: string }) {
  const max = Math.max(1, ...rows.filter((r) => !r.muted).map((r) => r.value));
  if (!rows.length) return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Nothing in this range yet.</Typography>;
  return (
    <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {rows.map((r) => (
        <Box component="li" key={r.key} aria-label={`${r.label}: ${r.value} ${unit}`}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: 14 }}>
            <Typography component="span" noWrap sx={{ fontSize: 14, fontWeight: 500, minWidth: 0, color: r.muted ? 'text.secondary' : 'text.primary' }}>
              {r.label}{' '}
              {r.sublabel && (
                <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {r.sublabel}
                </Typography>
              )}
            </Typography>
            <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {r.value}
              <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', ml: 0.75 }}>
                {pct(r.value, total)}%
              </Typography>
            </Typography>
          </Box>
          <Box sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: 'grey.100', overflow: 'hidden' }}>
            <Box
              sx={{
                height: '100%',
                width: `${r.muted ? 100 * Math.min(1, r.value / Math.max(total, 1)) : Math.max(2, (r.value / max) * 100)}%`,
                bgcolor: r.muted ? 'grey.400' : 'primary.main',
                borderRadius: 3,
              }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Panel({ title, children, note }: { title: string; children: React.ReactNode; note?: string | null }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
        {title}
      </Typography>
      {children}
      {note && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 'auto' }}>{note}</Typography>}
    </Paper>
  );
}

export default function InsightsTab({
  conversations,
  people,
  loading,
  range,
  onRange,
  onOpenChat,
  now,
}: {
  conversations: InboxConversation[];
  people: InboxPerson[];
  loading: boolean;
  range: InsightRange;
  onRange: (r: InsightRange) => void;
  onOpenChat: (conversationId: string) => void;
  now: Date;
}) {
  const ins = useMemo(() => buildInsights(conversations, people, range, now), [conversations, people, range, now]);
  const [state, setState] = useState<string | null>(null);

  const channelTotal = ins.channels.reduce((n, r) => n + r.value, 0);
  const placeTotal = ins.places.reduce((n, r) => n + r.value, 0);
  const recorded = ins.channels.filter((r) => !r.muted);
  const notRecorded = ins.channels.find((r) => r.muted)?.value ?? 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} role="group" aria-label="Range">
        {(Object.keys(RANGE_LABELS) as InsightRange[]).map((k) => (
          <Chip
            key={k}
            label={RANGE_LABELS[k]}
            clickable
            onClick={() => onRange(k)}
            color={range === k ? 'primary' : 'default'}
            variant={range === k ? 'filled' : 'outlined'}
            aria-pressed={range === k}
            sx={{ minHeight: 36, px: 0.5, fontWeight: 500 }}
          />
        ))}
      </Box>

      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 2 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <OpsSkeleton key={i} variant="rounded" height={104} />
          ))}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 2 }}>
          <StatCard label="Chatters" value={ins.chatters} note={`${ins.messages} questions`} />
          <StatCard label="Signed in" value={`${ins.signedInPct}%`} tone="primary" note={`${ins.signedIn} people · contactable`} />
          <StatCard label="Guests" value={ins.guests} note={ins.guests ? `${ins.guestsNoPlacePct}% without location` : 'None in this range'} />
          <StatCard label="Needs review" value={ins.needsReview} tone={ins.needsReview ? 'error' : undefined} note="Wrong or unclear answers" />
          <StatCard
            label="No answer"
            value={ins.noAnswer}
            tone={ins.noAnswer ? 'error' : undefined}
            note={ins.noAnswerCredits ? `${ins.noAnswerCredits} because credits ran out` : 'Every question got a reply'}
          />
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        <Panel
          title="Where they came from"
          note={
            notRecorded && !recorded.length
              ? 'Sources are recorded for chats from now on; older chats show as Not recorded.'
              : notRecorded
                ? `${notRecorded} older chats were logged before sources were recorded.`
                : null
          }
        >
          {loading ? <OpsSkeleton variant="rounded" height={160} /> : <Bars rows={ins.channels} total={channelTotal} unit="chats" />}
        </Panel>
        <Panel
          title="What they want"
          note={ins.topIntentShare ? `${ins.topIntentShare.label} is ${ins.topIntentShare.pct}% of all questions.` : null}
        >
          {loading ? <OpsSkeleton variant="rounded" height={160} /> : <Bars rows={ins.intents.slice(0, 7)} total={ins.messages} unit="questions" />}
        </Panel>
        <Panel title="Top locations" note="Places come from the visitor's connection, or the application form for signed-in students.">
          {loading ? <OpsSkeleton variant="rounded" height={160} /> : <Bars rows={ins.places} total={placeTotal} unit="people" />}
        </Panel>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2 }}>
        <Panel title="Questions Aintra struggles with">
          {loading ? (
            <OpsSkeleton variant="rounded" height={200} />
          ) : ins.struggles.length ? (
            <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead>
                <Box component="tr" sx={{ textAlign: 'left', color: 'text.secondary', fontSize: 12 }}>
                  <Box component="th" scope="col" sx={{ py: 1, fontWeight: 600 }}>
                    QUESTION
                  </Box>
                  <Box component="th" scope="col" sx={{ fontWeight: 600, px: 1 }}>
                    ASKED
                  </Box>
                  <Box component="th" scope="col" sx={{ fontWeight: 600 }}>
                    FLAGGED
                  </Box>
                </Box>
              </thead>
              <tbody>
                {ins.struggles.map((s) => (
                  <Box component="tr" key={s.question} sx={{ borderTop: 1, borderColor: 'divider' }}>
                    <Box component="td" sx={{ py: 0.5 }}>
                      <Button
                        onClick={() => onOpenChat(s.conversationId)}
                        sx={{ minHeight: 44, px: 0.5, textAlign: 'left', justifyContent: 'flex-start', fontWeight: 400, color: 'text.primary', textTransform: 'none' }}
                      >
                        {s.question}
                      </Button>
                    </Box>
                    <Box component="td" sx={{ px: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {s.asked}
                    </Box>
                    <Box component="td">
                      <Pill tone="error">{s.flagged} flagged</Pill>
                    </Box>
                  </Box>
                ))}
              </tbody>
            </Box>
          ) : (
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No flagged or unanswered questions in this range.</Typography>
          )}
        </Panel>
        <Panel title="Chatters by state" note="Select a state to highlight it. Boundaries: DataMeet India, CC BY 4.0.">
          {state && (
            <Chip
              size="small"
              label={ins.stateNames[state] ?? state}
              onDelete={() => setState(null)}
              deleteIcon={<ClearIcon aria-label="Show all states" />}
              sx={{ alignSelf: 'flex-start' }}
            />
          )}
          {loading ? (
            <OpsSkeleton variant="rounded" height={320} />
          ) : Object.keys(ins.stateValues).length ? (
            <IndiaStateMap values={ins.stateValues} names={ins.stateNames} selected={state} onSelect={setState} />
          ) : (
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No chatters with an Indian state in this range.</Typography>
          )}
        </Panel>
      </Box>
    </Box>
  );
}
