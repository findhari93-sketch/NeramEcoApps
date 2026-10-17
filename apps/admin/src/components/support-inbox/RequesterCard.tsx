'use client';

/** Who raised the ticket: contact, a link to User 360, and their other tickets. */
import { Avatar, Box, Button, Link, Typography } from '@neram/ui';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import CopyablePhone from '@/components/CopyablePhone';
import type { TicketRequesterSummary } from './api';
import { SegmentChip, Section, TicketStatusChip, initialsOf } from './bits';

export function RequesterCard({
  requester,
  onOpenTicket,
}: {
  requester: TicketRequesterSummary | null;
  onOpenTicket: (ticketNumber: string) => void;
}) {
  if (!requester) return null;
  return (
    <Section title="Requester">
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 1.5 }}>
        <Avatar src={requester.avatar_url || undefined} alt="" sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontSize: 15 }}>
          {initialsOf(requester.name)}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }} noWrap>
            {requester.name}
          </Typography>
          <SegmentChip segment={requester.segment} hasAccount={!!requester.user_id} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
        {requester.email ? (
          <Link href={`mailto:${requester.email}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: 44, fontSize: 14, wordBreak: 'break-all' }}>
            <EmailOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {requester.email}
          </Link>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No email on file
          </Typography>
        )}
        <CopyablePhone phone={requester.phone} fallback="No phone on file" />
      </Box>

      {requester.user_id ? (
        <Button
          href={`/crm/${requester.user_id}?from=support-tickets`}
          variant="outlined"
          startIcon={<PersonSearchIcon />}
          fullWidth
          sx={{ minHeight: 44, fontWeight: 600 }}
        >
          Open in User 360
        </Button>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Raised while signed out, so there is no account to open.
        </Typography>
      )}

      {requester.other_tickets.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>Other tickets</Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {requester.other_tickets.map((t) => (
              <Box component="li" key={t.id}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => onOpenTicket(t.ticket_number)}
                  sx={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    width: '100%',
                    minHeight: 44,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1,
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography component="span" sx={{ display: 'block', fontSize: 12, fontFamily: 'monospace', color: 'primary.main', fontWeight: 700 }}>
                      {t.ticket_number}
                    </Typography>
                    <Typography component="span" noWrap sx={{ display: 'block', fontSize: 13 }}>
                      {t.subject}
                    </Typography>
                  </Box>
                  <TicketStatusChip status={t.status} />
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Section>
  );
}
