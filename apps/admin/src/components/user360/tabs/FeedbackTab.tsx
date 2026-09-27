'use client';

import Link from 'next/link';
import { Box, Button, Chip, Rating, Typography } from '@neram/ui';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { PUBLICATION_STATUS_LABELS } from '@neram/database';
import type { PublicationStatus } from '@neram/database';
import { consentSummary, needsConfirmation, publicationLabel, testimonialText } from '@/lib/testimonial-moderation';
import { formatDate, sentenceCase } from '@/lib/user360-view';
import { EmptyNote, SectionCard, StatusChip, TwoColumns, type User360TabProps } from '../shared';
import { PublicationStatusIcon, publicationTone, ConsentIcon } from '@/components/testimonials/moderation-icons';

export default function FeedbackTab({ data }: User360TabProps) {
  const app = data.feedback?.appFeedback || [];
  const testimonials = data.feedback?.testimonials || [];
  const outcomes = data.outcomes || [];

  return (
    <Box sx={{ minWidth: 0 }}>
      <TwoColumns>
        <Box sx={{ minWidth: 0 }}>
          <SectionCard
            title={`Testimonials (${testimonials.length})`}
            icon={<FormatQuoteIcon />}
            action={
              testimonials.length ? (
                <Button component={Link} href="/testimonials?view=all" size="small" sx={{ textTransform: 'none', minHeight: 44 }}>
                  Open moderation
                </Button>
              ) : null
            }
          >
            {testimonials.length === 0 ? (
              <EmptyNote>No testimonial from this person.</EmptyNote>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
                {testimonials.map((t: any) => {
                  const status = t.publication_status as PublicationStatus;
                  const consent = consentSummary(t);
                  return (
                    <Box component="li" key={t.id} sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1, p: 1.5, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 0.75 }}>
                        <StatusChip
                          icon={<PublicationStatusIcon status={status} unconfirmed={needsConfirmation(t)} />}
                          label={publicationLabel(t, PUBLICATION_STATUS_LABELS) || sentenceCase(String(status))}
                          tone={publicationTone(status, needsConfirmation(t))}
                        />
                        {t.rating ? <Rating value={Number(t.rating)} readOnly size="small" aria-label={`${t.rating} out of 5`} /> : null}
                      </Box>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
                        {testimonialText(t.content) || 'No text'}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', mt: 1 }}>
                        <ConsentIcon state={consent.state} />
                        <Typography variant="caption" color="text.secondary">
                          <strong>{consent.label}.</strong> {consent.detail.replace(/\.?$/, '.')}
                          {t.submitted_at ? ` Sent ${formatDate(t.submitted_at)}.` : ''}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </SectionCard>

          <SectionCard title={`Outcomes (${outcomes.length})`} icon={<EmojiEventsOutlinedIcon />}>
            {outcomes.length === 0 ? (
              <EmptyNote>No exam results or college admissions recorded.</EmptyNote>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
                {outcomes.map((o: any) => {
                  const verified = o.verification_status === 'verified';
                  return (
                    <Box component="li" key={o.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      {verified ? (
                        <VerifiedUserOutlinedIcon sx={{ fontSize: 20, color: 'success.main', mt: 0.25 }} aria-hidden />
                      ) : (
                        <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary', mt: 0.25 }} aria-hidden />
                      )}
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {[o.exam, o.exam_year].filter(Boolean).join(' ')}
                          {o.outcome_type ? `: ${sentenceCase(String(o.outcome_type))}` : ''}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {[
                            o.college,
                            o.score != null ? `Score ${o.score}${o.max_score ? ` of ${o.max_score}` : ''}` : null,
                            o.rank != null ? `Rank ${o.rank}` : null,
                            verified ? 'Verified by staff' : 'Self reported',
                            o.is_public ? 'Public' : 'Not public',
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </SectionCard>
        </Box>

        <SectionCard title={`App feedback (${app.length})`} icon={<RateReviewOutlinedIcon />}>
          {app.length === 0 ? (
            <EmptyNote>No private feedback from this person.</EmptyNote>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25 }}>
              {app.map((f: any) => (
                <Box component="li" key={f.id} sx={{ borderBottom: '1px solid', borderColor: 'grey.100', pb: 1.25, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    {f.rating ? <Rating value={Number(f.rating)} readOnly size="small" aria-label={`${f.rating} out of 5`} /> : null}
                    {f.category && <Chip size="small" variant="outlined" label={sentenceCase(String(f.category))} />}
                    {f.status && <Chip size="small" label={sentenceCase(String(f.status))} />}
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(f.created_at)}
                    </Typography>
                  </Box>
                  {f.description && (
                    <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
                      {f.description}
                    </Typography>
                  )}
                  {Array.isArray(f.topics) && f.topics.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                      {f.topics.map((topic: string) => (
                        <Chip key={topic} size="small" label={sentenceCase(topic)} sx={{ height: 22, fontSize: 11.5 }} />
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </SectionCard>
      </TwoColumns>
    </Box>
  );
}
