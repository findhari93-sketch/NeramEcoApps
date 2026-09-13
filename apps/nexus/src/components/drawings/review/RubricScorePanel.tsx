'use client';

/**
 * Scoring a drawing, one criterion at a time.
 *
 * This replaces five anonymous stars. A single star rating told a student
 * nothing they could act on and told the next teacher nothing they could
 * compare, and it could not be defended to a parent past "it felt like a 3".
 * Four fixed criteria plus one the brief decides is the shape the founder's own
 * grading history already had; see lib/drawing-rubric.ts.
 *
 * Keyboard first, because this is a queue job. 1 to 5 scores the row in hand
 * and moves to the next unscored one, so a straightforward sheet is five
 * keystrokes and no mouse. The rows are still ordinary buttons, so tab and
 * arrow keys work for anyone not using the numbers.
 *
 * When a score lands two bands away from its reference (the previous attempt,
 * the student's last drawing, the class, or later the AI draft), the row asks
 * why, inline. See components/drawings/learning/TeachingMomentCard.tsx.
 *
 * With an AI draft, a criterion the model was sure of arrives scored and
 * read-only, one tap to change; anything less arrives as a hint beside an
 * unscored row. See lib/drawing-ai-draft.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { Box, Chip, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import TeachingMomentCard, { type NotedReason } from '@/components/drawings/learning/TeachingMomentCard';
import { REASONS, shouldAsk, type ReasonCode, type Reference } from '@/lib/drawing-teaching-moment';
import { rulesForCriterion, type GradingRule } from '@/lib/drawing-grading-rules';
import { prefillBands, rowMode, type AiDraft } from '@/lib/drawing-ai-draft';
import DraftThisButton from '@/components/drawings/learning/DraftThisButton';
import {
  criteriaForBrief,
  isFullyScored,
  overallFromBands,
  overallToStars,
  scoredCount,
  type Band,
  type BandMap,
  type RubricCriterion,
} from '@/lib/drawing-rubric';

const BANDS: Band[] = [1, 2, 3, 4, 5];

/** What each band means, so the numbers are not arbitrary. */
const BAND_LABEL: Record<Band, string> = {
  1: 'Needs work',
  2: 'Below average',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
};

export interface RubricScorePanelProps {
  submissionId: string;
  getToken: () => Promise<string | null>;
  readOnly?: boolean;
  /**
   * The star the rubric implies, reported up on every change.
   *
   * The review save stays the single writer of `drawing_submissions.tutor_rating`,
   * which the queue, the gallery, the roster and the student page all read. This
   * panel only tells it what to write.
   */
  onOverallChange?: (stars: Band | null, overall: number | null) => void;
  /** The AI draft on this sheet, when one exists. */
  aiDraft?: AiDraft | null;
  /** Called after Draft this returns a draft, so the screen can load it. */
  onDrafted?: () => void;
}

export default function RubricScorePanel({
  submissionId,
  getToken,
  readOnly = false,
  onOverallChange,
  aiDraft = null,
  onDrafted,
}: RubricScorePanelProps) {
  const theme = useTheme();
  const [criteria, setCriteria] = useState<RubricCriterion[]>(() => criteriaForBrief(null));
  const [bands, setBands] = useState<BandMap>({});
  const [loading, setLoading] = useState(true);
  /** Set when this environment has no evaluation tables. */
  const [unavailable, setUnavailable] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const router = useRouter();
  const [references, setReferences] = useState<Record<string, Reference | null>>({});
  const [rules, setRules] = useState<GradingRule[]>([]);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  /** The disagreement whose question is open. Others wait as a one-line prompt. */
  const [askKey, setAskKey] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [noted, setNoted] = useState<Record<string, NotedReason>>({});
  /** Confident draft rows the teacher chose to take over. */
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const prefilledFor = useRef<string | null>(null);

  const overall = overallFromBands(bands, criteria);
  const done = scoredCount(bands, criteria);
  const complete = isFullyScored(bands, criteria);

  const reportRef = useRef(onOverallChange);
  reportRef.current = onOverallChange;

  /**
   * Held in a ref, not a dependency.
   *
   * getToken comes from the auth context and is a fresh function on every
   * render, and this panel's parent re-renders on every keystroke in the
   * feedback box. In the dependency array it re-ran the load forever, so the
   * panel never left its skeleton and the screen quietly hammered the API.
   */
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  useEffect(() => {
    reportRef.current?.(overallToStars(overall), overall);
  }, [overall]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        const res = await fetch(`/api/drawing/submissions/${submissionId}/rubric`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (cancelled) return;
        if (Array.isArray(body.criteria) && body.criteria.length) setCriteria(body.criteria);
        setBands(body.bands ?? {});
        setReferences(body.references ?? {});
        setRules(Array.isArray(body.rules) ? body.rules : []);
        setAssignmentId(body.assignment_id ?? null);
        // Reasons already given on this sheet show as noted, not as questions.
        const existing = (body.corrections ?? {}) as Record<string, { reason_code: string | null; reason_text: string | null }>;
        setNoted(Object.fromEntries(Object.entries(existing).map(([key, c]) => [key, {
          label: c.reason_text || REASONS.find((r) => r.code === c.reason_code)?.label || 'your own reason',
          rule: null,
          matches: [],
        }])));
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId]);

  /** The row the number keys act on: wherever the teacher is, else the next gap. */
  const activeKey = useMemo(() => {
    if (focusedKey) return focusedKey;
    return criteria.find((c) => !bands[c.key])?.key ?? null;
  }, [focusedKey, criteria, bands]);

  /**
   * One save in flight at a time, always carrying the newest state.
   *
   * Each PUT replaces the whole set, so two of them racing can land in the
   * wrong order and lose a score: pressing 4 then 2 quickly wrote {composition}
   * and {composition, proportion} concurrently, and the first one finishing
   * last took proportion back out again. Queueing collapses a burst of
   * keystrokes into the fewest requests that still end at the right answer, and
   * unlike a debounce it cannot drop the final one.
   */
  const savingRef = useRef(false);
  const pendingRef = useRef<BandMap | null>(null);

  const flush = useCallback(async () => {
    if (savingRef.current) return;
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    savingRef.current = true;
    try {
      const token = await tokenRef.current();
      await fetch(`/api/drawing/submissions/${submissionId}/rubric`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bands: next }),
        // Scoring the last criterion and pressing Complete in the same breath is
        // the normal way to work, and that navigation would otherwise cancel
        // this request mid-flight and lose the score. The payload is a handful
        // of small numbers, well inside what keepalive allows.
        keepalive: true,
      });
    } catch {
      // The score stays on screen and rides out with the review either way:
      // tutor_rating is written by the review save, not by this request.
    } finally {
      savingRef.current = false;
      if (pendingRef.current) void flush();
    }
  }, [submissionId]);

  const save = useCallback((next: BandMap) => {
    pendingRef.current = next;
    void flush();
  }, [flush]);

  // A confident draft fills the gaps once, as soon as both the saved scores and
  // the draft are in. Saved at once so the review record matches the screen:
  // approving without touching a row is agreeing with it.
  useEffect(() => {
    if (readOnly || loading || unavailable || !aiDraft) return;
    if (prefilledFor.current === aiDraft.evaluation_id) return;
    prefilledFor.current = aiDraft.evaluation_id;
    const allowed = new Set(criteria.map((c) => c.key));
    const next = prefillBands(
      { ...aiDraft, criteria: Object.fromEntries(Object.entries(aiDraft.criteria).filter(([k]) => allowed.has(k))) },
      bands,
    );
    if (Object.keys(next).length !== Object.keys(bands).length) {
      setBands(next);
      save(next);
    }
  }, [readOnly, loading, unavailable, aiDraft, criteria, bands, save]);

  const setBand = useCallback((key: string, band: Band) => {
    const clearing = bands[key] === band;
    setBands((prev) => {
      // Pressing the same number again clears it, which is the only way back
      // from a misclick without a separate control.
      const next = { ...prev };
      if (next[key] === band) delete next[key];
      else next[key] = band;
      void save(next);
      return next;
    });
    // A new score makes any earlier answer stale (the server clears it too).
    setNoted((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSkipped((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (!clearing && shouldAsk(band, references[key] ?? null)) setAskKey(key);
    else if (askKey === key) setAskKey(null);
    const index = criteria.findIndex((c) => c.key === key);
    const nextGap = criteria.slice(index + 1).find((c) => !bands[c.key]);
    setFocusedKey(nextGap?.key ?? null);
  }, [criteria, bands, save, references, askKey]);

  const recordReason = useCallback(async (
    key: string,
    reference: Reference,
    finalBand: Band,
    input: { reason_code: ReasonCode; reason_text: string | null; remember: boolean },
  ) => {
    const token = await tokenRef.current();
    const res = await fetch(`/api/drawing/submissions/${submissionId}/rubric/correction`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        criterion_key: key,
        final_band: finalBand,
        reference_band: reference.band,
        reference_kind: reference.kind,
        ...input,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Could not save that reason');
    const label = input.reason_text || REASONS.find((r) => r.code === input.reason_code)?.label || 'your own reason';
    setNoted((prev) => ({ ...prev, [key]: { label, rule: body.rule ?? null, matches: body.matches ?? [] } }));
    if (body.rule) setRules((prev) => [{ ...body.rule, teacher_id: '', brief_type_id: null, criterion_key: key, reason_code: input.reason_code, is_active: true, applied_count: 0, created_at: new Date().toISOString() }, ...prev]);
    setAskKey((current) => (current === key ? null : current));
    return { rule: body.rule ?? null, matches: body.matches ?? [] };
  }, [submissionId]);

  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const band = Number(e.key);
      if (!Number.isInteger(band) || band < 1 || band > 5) return;
      if (!activeKey) return;
      e.preventDefault();
      setBand(activeKey, band as Band);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly, activeKey, setBand]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={56} />)}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main' }}>
          01
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>
          SCORE
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {readOnly ? `${done} of ${criteria.length} scored` : 'keys 1 to 5'}
        </Typography>
        {aiDraft && (
          <Chip
            size="small"
            label="AI DRAFT"
            data-testid="ai-draft-chip"
            sx={{ height: 20, fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.04em', bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.dark' }}
          />
        )}
        {/* role=status so the total is announced as it changes, rather than a
            screen-reader user having to hunt for it after every keystroke. */}
        <Typography
          variant="h6"
          role="status"
          aria-label={
            overall != null
              ? `Overall ${overall.toFixed(1)} out of 5, ${done} of ${criteria.length} criteria scored`
              : 'Overall not scored yet'
          }
          sx={{ fontWeight: 800, lineHeight: 1 }}
        >
          {overall != null ? overall.toFixed(1) : '--'}
          <Typography component="span" variant="caption" color="text.secondary">/5</Typography>
        </Typography>
      </Box>

      {!readOnly && !aiDraft && onDrafted && (
        <DraftThisButton submissionId={submissionId} getToken={getToken} onDrafted={onDrafted} />
      )}

      {unavailable && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Per-criterion scoring is not set up in this environment. The star rating below still works.
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {criteria.map((criterion) => {
          const band = bands[criterion.key];
          const isActive = !readOnly && activeKey === criterion.key;
          return (
            <Box
              key={criterion.key}
              sx={{
                border: '1px solid',
                borderColor: isActive ? 'primary.main' : 'divider',
                borderRadius: 1.5,
                p: 1,
                bgcolor: isActive ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
                  {criterion.title}
                </Typography>
                {band ? (
                  <Chip
                    size="small"
                    label={BAND_LABEL[band]}
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                  />
                ) : (
                  !readOnly && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      not scored
                    </Typography>
                  )
                )}
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.75, fontSize: '0.68rem', lineHeight: 1.35 }}
              >
                {criterion.hint}
              </Typography>
              {(() => {
                const mine = readOnly ? [] : rulesForCriterion(rules, criterion.key);
                if (mine.length === 0) return null;
                return (
                  <Box data-testid="grading-rule-hint" sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.75 }}>
                    <RuleOutlinedIcon aria-hidden sx={{ fontSize: 14, mt: '1px', color: 'primary.main' }} />
                    <Typography variant="caption" sx={{ fontSize: '0.7rem', lineHeight: 1.35, color: 'text.secondary' }}>
                      Your rule: {mine[0].text}
                      {mine.length > 1 && (
                        <>
                          {' '}
                          <Box component={NextLink} href="/teacher/drawing-reviews/profile" sx={{ color: 'primary.main', fontWeight: 600 }}>
                            +{mine.length - 1} more
                          </Box>
                        </>
                      )}
                    </Typography>
                  </Box>
                );
              })()}

              {(() => {
                const mode = readOnly ? 'input' : rowMode(criterion.key, aiDraft, band, unlocked.has(criterion.key));
                const drafted = aiDraft?.criteria[criterion.key];
                if (mode === 'suggested' && drafted) {
                  return (
                    <Typography variant="caption" data-testid="ai-suggested" sx={{ display: 'block', mb: 0.75, fontSize: '0.72rem', lineHeight: 1.35, color: 'primary.dark' }}>
                      Draft says {drafted.ai_band}, unsure. Your call.{drafted.reasoning ? ` ${drafted.reasoning}` : ''}
                    </Typography>
                  );
                }
                return null;
              })()}

              {!readOnly && band && rowMode(criterion.key, aiDraft, band, unlocked.has(criterion.key)) === 'confirmed' ? (
                <Box data-testid="ai-confirmed" sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 44 }}>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem', lineHeight: 1.35 }}>
                    <Box component="span" sx={{ fontWeight: 700 }}>Draft: {band}, {BAND_LABEL[band]}.</Box>
                    {aiDraft?.criteria[criterion.key]?.reasoning ? ` ${aiDraft.criteria[criterion.key].reasoning}` : ''}
                  </Typography>
                  <Box
                    component="button"
                    type="button"
                    aria-label={`Change ${criterion.title}, drafted as ${band}`}
                    onClick={() => {
                      setUnlocked((prev) => new Set(prev).add(criterion.key));
                      setFocusedKey(criterion.key);
                    }}
                    sx={{
                      all: 'unset', cursor: 'pointer', flexShrink: 0, minHeight: 44, minWidth: 44, px: 1,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.78rem', fontWeight: 700, color: 'primary.main', borderRadius: 1,
                      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                    }}
                  >
                    Change
                  </Box>
                </Box>
              ) : (
              <Box role="group" aria-label={criterion.title} sx={{ display: 'flex', gap: 0.5 }}>
                {BANDS.map((value) => {
                  const selected = band === value;
                  return (
                    <Box
                      key={value}
                      component="button"
                      type="button"
                      disabled={readOnly}
                      aria-pressed={selected}
                      aria-label={`${criterion.title} ${value}, ${BAND_LABEL[value]}`}
                      onFocus={() => setFocusedKey(criterion.key)}
                      onClick={() => setBand(criterion.key, value)}
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: 44,
                        border: '1px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        bgcolor: selected ? 'primary.main' : 'background.paper',
                        color: selected ? 'primary.contrastText' : 'text.primary',
                        borderRadius: 1,
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: readOnly ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                        transition: 'background-color 0.15s, border-color 0.15s',
                        '&:hover:not(:disabled)': {
                          borderColor: 'primary.main',
                          bgcolor: selected ? 'primary.dark' : alpha(theme.palette.primary.main, 0.08),
                        },
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: 2,
                        },
                        '&:disabled': { opacity: band ? 1 : 0.45 },
                      }}
                    >
                      {value}
                    </Box>
                  );
                })}
              </Box>
              )}

              {(() => {
                const reference = references[criterion.key] ?? null;
                if (readOnly || !band || !reference || !shouldAsk(band, reference)) return null;
                const note = noted[criterion.key] ?? null;
                if (!note && skipped.has(criterion.key)) return null;
                if (!note && askKey !== criterion.key) {
                  return (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => setAskKey(criterion.key)}
                      sx={{
                        all: 'unset', cursor: 'pointer', mt: 0.5, minHeight: 32, display: 'flex', alignItems: 'center',
                        fontSize: '0.72rem', fontWeight: 600, color: 'primary.main',
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                      }}
                    >
                      {band} against {reference.band}: say why
                    </Box>
                  );
                }
                return (
                  <TeachingMomentCard
                    criterionTitle={criterion.title}
                    finalBand={band}
                    reference={reference}
                    noted={note}
                    onSubmit={(input) => recordReason(criterion.key, reference, band, input)}
                    onSkip={() => {
                      setSkipped((prev) => new Set(prev).add(criterion.key));
                      setAskKey(null);
                    }}
                    onReopen={() => {
                      setNoted((prev) => {
                        const next = { ...prev };
                        delete next[criterion.key];
                        return next;
                      });
                      setAskKey(criterion.key);
                    }}
                    onShowMatches={(ids) => {
                      const qs = assignmentId ? `?assignment=${assignmentId}` : '';
                      if (ids[0]) router.push(`/teacher/drawing-reviews/${ids[0]}${qs}`);
                    }}
                  />
                );
              })()}
            </Box>
          );
        })}
      </Box>

      {!readOnly && !complete && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.75, fontSize: '0.68rem' }}
        >
          {done === 0
            ? 'Nothing scored yet. The overall is the average of what you do score.'
            : `${criteria.length - done} still to score. The overall averages the ${done} you have.`}
        </Typography>
      )}
    </Box>
  );
}
