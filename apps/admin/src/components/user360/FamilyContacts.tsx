'use client';

/**
 * Family contacts on User 360: the other numbers and emails this person is
 * reachable on (user_contacts). A parent's number folded in by a family merge,
 * the number staff typed on the enrolment link, the form's parent phone. Shown
 * so staff call the family once, on the right number.
 */

import { useEffect, useState } from 'react';
import { Box, IconButton, Skeleton, Tooltip, Typography } from '@neram/ui';
import { formatPhoneForDisplay } from '@neram/database/phone';
import type { UserContact } from '@neram/database';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import MailOutlineIcon from '@mui/icons-material/MailOutline';

const RELATION: Record<UserContact['relation'], string> = {
  parent: 'Parent',
  guardian: 'Guardian',
  unknown: 'Family number',
  self: 'Their older number',
};

const SOURCE: Record<UserContact['source'], string> = {
  merge: 'from a merged record',
  enrolment_link: 'typed on the enrolment link',
  lead_form: 'from the application form',
  staff: 'added by staff',
  otp: 'verified by OTP',
};

const iconButtonSx = { width: 44, height: 44 } as const;

export default function FamilyContacts({ personId }: { personId: string }) {
  const [contacts, setContacts] = useState<UserContact[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/crm/contacts?person=${personId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => alive && setContacts(Array.isArray(d.contacts) ? d.contacts : []))
      .catch(() => alive && setContacts([]));
    return () => {
      alive = false;
    };
  }, [personId]);

  if (contacts === null) return <Skeleton variant="rounded" height={40} sx={{ mt: 1 }} />;
  if (contacts.length === 0) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>
        Other numbers and emails
      </Typography>
      <Box sx={{ display: 'grid', gap: 0.25 }}>
        {contacts.map((c) => {
          const digits = c.kind === 'phone' ? (c.value.replace(/\D/g, '').length === 10 ? `91${c.value.replace(/\D/g, '')}` : c.value.replace(/\D/g, '')) : '';
          const shown = c.kind === 'phone' ? formatPhoneForDisplay(c.value) : c.value;
          return (
            <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                  {shown}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {RELATION[c.relation]}
                  {c.name ? ` (${c.name})` : ''}, {SOURCE[c.source]}
                </Typography>
              </Box>
              {c.kind === 'phone' ? (
                <Box sx={{ display: 'flex', flexShrink: 0 }}>
                  <Tooltip title={`Call ${shown}`}>
                    <IconButton component="a" href={`tel:+${digits}`} aria-label={`Call ${shown}`} sx={iconButtonSx}>
                      <PhoneOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={`WhatsApp ${shown}`}>
                    <IconButton
                      component="a"
                      href={`https://wa.me/${digits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp ${shown}`}
                      sx={{ ...iconButtonSx, color: 'success.dark' }}
                    >
                      <WhatsAppIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ) : (
                <Tooltip title={`Email ${shown}`}>
                  <IconButton component="a" href={`mailto:${c.value}`} aria-label={`Email ${shown}`} sx={iconButtonSx}>
                    <MailOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
