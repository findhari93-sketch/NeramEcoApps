'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Typography, TextField, Alert, CircularProgress } from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import { DocHeader, Section, FactsCard, CtaButton, tokens as t } from '@/design-system';

interface TicketData {
  ticket_number: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  comments: Array<{ content: string; created_at: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; iconColor: string; icon: React.ReactNode }> = {
  open: { label: 'Open', iconColor: t.gold800, icon: <ErrorOutlineOutlinedIcon aria-hidden /> },
  in_progress: { label: 'In Progress', iconColor: t.inkMuted, icon: <HourglassEmptyOutlinedIcon aria-hidden /> },
  waiting_on_student: { label: 'Needs your reply', iconColor: t.gold800, icon: <AccessTimeOutlinedIcon aria-hidden /> },
  awaiting_confirmation: { label: 'Fixed, please confirm', iconColor: t.success, icon: <CheckCircleOutlinedIcon aria-hidden /> },
  resolved: { label: 'Resolved', iconColor: t.success, icon: <CheckCircleOutlinedIcon aria-hidden /> },
  closed: { label: 'Closed', iconColor: t.inkMuted, icon: <CheckCircleOutlinedIcon aria-hidden /> },
};

const CATEGORY_LABELS: Record<string, string> = {
  enrollment_issue: 'Enrollment Issue',
  payment_issue: 'Payment Issue',
  technical_issue: 'Technical Issue',
  account_issue: 'Account Issue',
  course_question: 'Course Question',
  other: 'Other',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const cardSx = {
  bgcolor: t.surface,
  border: `1px solid ${t.line}`,
  borderRadius: `${t.radius}px`,
  color: t.ink,
} as const;

/** Utility page: light DocHeader, then the lookup card and the ticket on the ground band. */
export default function TicketTrackContent() {
  const searchParams = useSearchParams();
  const [ticketNumber, setTicketNumber] = useState('');
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-lookup if ticket number is in URL
  useEffect(() => {
    const fromUrl = searchParams.get('ticket');
    if (fromUrl) {
      setTicketNumber(fromUrl);
      lookupTicket(fromUrl);
    }
  }, [searchParams]);

  async function lookupTicket(number?: string) {
    const query = (number || ticketNumber).trim().toUpperCase();
    if (!query) {
      setError('Please enter a ticket number');
      return;
    }

    setLoading(true);
    setError('');
    setTicket(null);

    try {
      const res = await fetch(`/api/support-tickets/track?ticket=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Ticket not found');
        return;
      }

      setTicket(data);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const statusConfig = ticket ? STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open : null;

  return (
    <Box>
      <DocHeader
        width="legal"
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Track Ticket' }]}
        title="Track Your Ticket"
        lede="Enter your ticket number to check the status"
      />

      <Section width="legal" rule={false} gap={3} py={{ xs: 5, md: 7 }} sx={{ minHeight: { xs: '50vh', md: '55vh' } }}>
        {/* Search form */}
        <Box
          component="form"
          role="search"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            lookupTicket();
          }}
          sx={{ ...cardSx, p: { xs: 2.5, sm: 3 }, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: { sm: 'flex-start' } }}
        >
          <TextField
            fullWidth
            label="Ticket number"
            placeholder="NERAM-TKT-00001"
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value.toUpperCase())}
            inputProps={{ style: { fontFamily: t.fontMono, letterSpacing: 1 }, autoCapitalize: 'characters', spellCheck: false }}
          />
          <CtaButton
            type="submit"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" aria-hidden /> : <SearchOutlinedIcon aria-hidden />}
            endIcon={null}
            sx={{ minWidth: 140, minHeight: 56, whiteSpace: 'nowrap' }}
          >
            {loading ? 'Searching...' : 'Track'}
          </CtaButton>
        </Box>

        {/* Error */}
        {error && <Alert severity="error" role="alert">{error}</Alert>}

        {/* Ticket result */}
        {ticket && statusConfig && (
          <Box component="article" aria-live="polite" sx={{ ...cardSx, overflow: 'hidden' }}>
            <Box
              sx={{
                p: { xs: 2.5, sm: 3 },
                bgcolor: t.ground,
                borderBottom: `1px solid ${t.line}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 1.5,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography component="p" sx={{ m: 0, fontFamily: t.fontMono, fontSize: '0.8125rem', color: t.inkMuted, wordBreak: 'break-all' }}>
                  {ticket.ticket_number}
                </Typography>
                <Typography component="h2" sx={{ m: 0, mt: 0.5, fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.3 }}>
                  {ticket.subject}
                </Typography>
              </Box>
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  border: `1px solid ${t.line}`,
                  borderRadius: `${t.radiusPill}px`,
                  bgcolor: t.surface,
                  px: 1.5,
                  py: 0.5,
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: t.ink,
                  '& svg': { fontSize: 18, color: statusConfig.iconColor },
                }}
              >
                {statusConfig.icon}
                {statusConfig.label}
              </Box>
            </Box>

            <Box sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ '& > div': { border: 0, p: 0.5 } }}>
                <FactsCard
                  items={[
                    { label: 'Category', value: CATEGORY_LABELS[ticket.category] || ticket.category },
                    { label: 'Created', value: formatDate(ticket.created_at) },
                    { label: 'Last Updated', value: formatDate(ticket.updated_at) },
                    ...(ticket.resolved_at ? [{ label: 'Resolved', value: formatDate(ticket.resolved_at) }] : []),
                  ]}
                />
              </Box>

              {/* Resolution notes */}
              {ticket.resolution_notes && (
                <Box
                  sx={{
                    border: `1px solid ${t.line}`,
                    borderLeft: 'none',
                    boxShadow: `inset 3px 0 0 ${t.success}`,
                    borderRadius: `${t.radius}px`,
                    p: 2,
                    pl: 2.5,
                    display: 'flex',
                    gap: 1.25,
                    alignItems: 'flex-start',
                  }}
                >
                  <CheckCircleOutlinedIcon aria-hidden sx={{ fontSize: 20, color: t.success, flexShrink: 0, mt: '2px' }} />
                  <Box>
                    <Typography component="h3" sx={{ m: 0, mb: 0.5, fontSize: '1rem', fontWeight: 700 }}>
                      Resolution
                    </Typography>
                    <Typography component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.55, color: t.inkMuted }}>
                      {ticket.resolution_notes}
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* Team replies */}
              {ticket.comments.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 700 }}>
                    Updates from our team
                  </Typography>
                  {ticket.comments.map((comment, i) => (
                    <Box key={i} sx={{ border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, bgcolor: t.ground, p: 2 }}>
                      <Typography component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.55 }}>
                        {comment.content}
                      </Typography>
                      <Typography
                        component="p"
                        sx={{ m: 0, mt: 1, display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.8125rem', color: t.inkMuted }}
                      >
                        <AccessTimeOutlinedIcon aria-hidden sx={{ fontSize: 14 }} />
                        {formatDate(comment.created_at)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Section>
    </Box>
  );
}
