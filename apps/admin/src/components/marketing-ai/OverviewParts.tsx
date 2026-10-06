'use client';

/**
 * Overview cards for "what is happening": Neram's own sign-up count against
 * spend, the agent's recent changes (with Undo), and the weekly AI report.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Box, Button, Paper, Typography } from '@neram/ui';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import UndoIcon from '@mui/icons-material/Undo';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { StatusChip, TARGET_44 } from '@/components/ops/OpsUi';
import { ConfirmDialog } from './Parts';
import { api, inr, num, when } from './format';

export function SignupsCard({ signups }: { signups: { verified: number; from_google_ads: number; spent: number; cost_per_google_signup: number | null } | null }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="subtitle1" component="h2" fontWeight={700}>
        Sign-ups this month
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        People who signed in to the app and verified their phone, counted in Neram&apos;s own database.
      </Typography>
      {!signups ? (
        <Typography variant="body2" color="text.secondary">Not available.</Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
          <Metric label="From Google Ads" value={num(signups.from_google_ads)} />
          <Metric label="Cost per sign-up" value={signups.cost_per_google_signup === null ? 'n/a' : inr(signups.cost_per_google_signup)} />
          <Metric label="All sources" value={num(signups.verified)} />
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Google&apos;s own conversion count can be higher: it also matches sign-ups by hashed phone and email when the ad click id was lost.
      </Typography>
    </Paper>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography variant="h5" component="p" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}

export interface ActivityItem {
  id: string;
  recommendation_id: string | null;
  title: string;
  status: string;
  automatic: boolean;
  dry_run: boolean;
  error: string | null;
  created_at: string;
  can_undo: boolean;
}

/** The agent's last changes. Each line says who decided (automatic or an admin) in words and an icon, never colour alone. */
export function ActivityFeed({ items, onChanged }: { items: ActivityItem[]; onChanged: (message: string) => void }) {
  const [undo, setUndo] = useState<ActivityItem | null>(null);
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle1" component="h2" fontWeight={700}>
          What the agent changed
        </Typography>
        <Button component={Link} href="/marketing-ai/audit" size="small" sx={TARGET_44}>
          Full log
        </Button>
      </Box>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No changes yet. Automatic changes and the ones you approve appear here.
        </Typography>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid', gap: 0.5 }}>
          {items.map((a) => (
            <Box component="li" key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  component={a.recommendation_id ? Link : 'span'}
                  href={a.recommendation_id ? `/marketing-ai/recommendations?view=done&id=${a.recommendation_id}` : undefined}
                  sx={{ color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: a.recommendation_id ? 'underline' : 'none' }, wordBreak: 'break-word' }}
                >
                  {a.title}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
                  <StatusChip icon={a.automatic ? SmartToyOutlinedIcon : PersonOutlineIcon} label={a.automatic ? 'Automatic' : 'You approved'} tone={a.automatic ? 'info' : 'neutral'} />
                  {a.status === 'failed' && <StatusChip icon={ErrorOutlineIcon} tone="error" label="Google refused" />}
                  {a.dry_run && a.status !== 'failed' && <StatusChip icon={ScienceOutlinedIcon} tone="warning" label="Dry run only" />}
                  {a.status === 'reverted' && <StatusChip icon={UndoIcon} label="Undone" />}
                  <Typography variant="caption" color="text.secondary">
                    {when(a.created_at)}
                  </Typography>
                </Box>
              </Box>
              {a.can_undo && (
                <Button size="small" color="warning" startIcon={<UndoIcon />} sx={TARGET_44} onClick={() => setUndo(a)} aria-label={`Undo: ${a.title}`}>
                  Undo
                </Button>
              )}
            </Box>
          ))}
        </Box>
      )}
      <ConfirmDialog
        open={!!undo}
        title="Undo this change?"
        body={<Typography variant="body2">This puts Google Ads back the way it was before: {undo?.title}.</Typography>}
        confirmLabel="Undo"
        tone="warning"
        onCancel={() => setUndo(null)}
        onConfirm={async () => {
          const r = await api(`/api/marketing-ai/actions/${undo!.id}/revert`, { method: 'POST' });
          if (r.status === 'failed') throw new Error(r.message);
          setUndo(null);
          onChanged(r.message);
        }}
      />
    </Paper>
  );
}

export function WeeklyReportCard({ report }: { report: { week_start: string; summary: string; next_steps: string[]; created_at: string } | null }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="subtitle1" component="h2" fontWeight={700}>
        Weekly AI report
      </Typography>
      {!report ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          The first report arrives on Monday morning, after a full week of data.
        </Typography>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary">
            Week from {report.week_start}. Written by the AI from the numbers; any figure it quotes was checked.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, maxWidth: 760 }}>
            {report.summary}
          </Typography>
          {report.next_steps?.length > 0 && (
            <>
              <Typography variant="body2" fontWeight={700} sx={{ mt: 1.5 }}>
                Next steps
              </Typography>
              <Box component="ol" sx={{ pl: 2.5, my: 0.5 }}>
                {report.next_steps.map((s) => (
                  <Typography component="li" variant="body2" key={s}>
                    {s}
                  </Typography>
                ))}
              </Box>
            </>
          )}
        </>
      )}
    </Paper>
  );
}
