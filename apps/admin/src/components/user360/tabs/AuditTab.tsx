'use client';

import { Alert, Box, Typography } from '@neram/ui';
import MergeTypeOutlinedIcon from '@mui/icons-material/MergeTypeOutlined';
import HistoryTimeline from '@/components/crm/HistoryTimeline';
import { formatDateTime } from '@/lib/user360-view';
import { EmptyNote, SectionCard, TwoColumns, type User360TabProps } from '../shared';

export default function AuditTab({ data, detail }: User360TabProps) {
  const merges = data.merges || [];
  return (
    <TwoColumns>
      <Box sx={{ minWidth: 0 }} id="crm-section-history">
        {detail ? (
          <HistoryTimeline history={detail.profileHistory} />
        ) : (
          <Alert severity="warning">The change history could not be loaded. Reload the page to try again.</Alert>
        )}
      </Box>
      <SectionCard title={`Merged records (${merges.length})`} icon={<MergeTypeOutlinedIcon />}>
        {merges.length === 0 ? (
          <EmptyNote>No duplicate record has been merged into this person.</EmptyNote>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25 }}>
            {merges.map((m: any) => {
              const snap = (m.loser_snapshot || {}) as Record<string, any>;
              return (
                <Box component="li" key={m.id} sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1, p: 1.25, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                    {snap.name || 'Unnamed record'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                    {[snap.email, snap.phone].filter(Boolean).join(', ') || 'No contact on the merged record'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Merged {formatDateTime(m.merged_at)}
                    {m.merged_by ? ' by staff' : ''}. The merged record id was {String(m.loser_id).slice(0, 8)}.
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </SectionCard>
    </TwoColumns>
  );
}
