'use client';

import { Box, Typography } from '@neram/ui';
import InfoRow from './InfoRow';
import type { LeadProfile } from '@neram/database';

interface LocationSectionProps {
  leadProfile: LeadProfile;
}

export default function LocationSection({ leadProfile }: LocationSectionProps) {
  const hasLocation = leadProfile.address || leadProfile.city || leadProfile.state || leadProfile.pincode;
  if (!hasLocation) return null;

  const parts: string[] = [];
  if (leadProfile.address) parts.push(leadProfile.address);
  const cityDistrict = [leadProfile.city, leadProfile.district].filter(Boolean).join(', ');
  if (cityDistrict) parts.push(cityDistrict);
  const statePin = [leadProfile.state, leadProfile.pincode].filter(Boolean).join(' - ');
  if (statePin) parts.push(statePin);
  if (leadProfile.country && leadProfile.country !== 'IN') parts.push(leadProfile.country);

  return (
    <Box>
      <InfoRow label="Address" value={parts.join(', ')} />
      {leadProfile.city && <InfoRow label="City" value={leadProfile.city} />}
      {leadProfile.district && <InfoRow label="District" value={leadProfile.district} />}
      {leadProfile.state && <InfoRow label="State" value={leadProfile.state} />}
      {leadProfile.pincode && <InfoRow label="Pincode" value={leadProfile.pincode} />}
      {leadProfile.country && leadProfile.country !== 'IN' && (
        <InfoRow label="Country" value={leadProfile.country} />
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        From your application. Contact support to update.
      </Typography>
    </Box>
  );
}
