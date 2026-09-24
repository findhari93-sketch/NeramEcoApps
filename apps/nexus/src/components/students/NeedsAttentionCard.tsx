'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Divider, Paper, Typography, alpha, useMediaQuery, useTheme } from '@neram/ui';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { buildAttentionRows, type AttentionActionKey, type AttentionInput } from '@/lib/student-attention';

export const ATTENTION_COLLAPSED_KEY = 'nexus:students:attention-collapsed';

export interface NeedsAttentionCardProps extends AttentionInput {
  /** Holds coord.student.stage. The list filters stay available without it. */
  canEdit: boolean;
  onAction: (key: AttentionActionKey) => void;
}

/**
 * Everything on this roster that needs a person to act, most damaging first.
 *
 * Replaces the class-and-year banner, and deliberately is not an ARIA alert: it is
 * present on most visits, and an alert would be announced every time the page
 * loads. A labelled region instead, one tap per problem to the fixed state.
 *
 * On a phone it starts folded. Four open rows filled the whole first screen of a
 * 375px phone and pushed the students a teacher came for below the fold, while the
 * folded header still says how many problems there are. Whatever someone chooses
 * is remembered on this device and wins over the default.
 */
export default function NeedsAttentionCard({ canEdit, onAction, ...input }: NeedsAttentionCardProps) {
  const rows = buildAttentionRows(input);
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const [collapsed, setCollapsed] = useState(isPhone);

  // Read after mount: reading localStorage during render breaks hydration.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ATTENTION_COLLAPSED_KEY);
      setCollapsed(stored === null ? isPhone : stored === '1');
    } catch {
      setCollapsed(isPhone);
    }
  }, [isPhone]);

  if (!rows.length) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(ATTENTION_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* non-fatal */
    }
  };

  return (
    <Paper
      component="section"
      aria-label="Needs attention"
      variant="outlined"
      sx={{ borderRadius: 2, overflow: 'hidden', borderColor: (t) => alpha(t.palette.warning.main, 0.5) }}
    >
      <Button
        fullWidth
        onClick={toggle}
        aria-expanded={!collapsed}
        startIcon={<ReportProblemOutlinedIcon />}
        endIcon={collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
        sx={{
          justifyContent: 'flex-start',
          minHeight: 48,
          px: 1.5,
          textTransform: 'none',
          fontWeight: 700,
          color: 'text.primary',
          '& .MuiButton-startIcon': { color: 'warning.dark' },
          '& .MuiButton-endIcon': { ml: 'auto' },
        }}
      >
        Needs attention ({rows.length})
      </Button>

      {!collapsed && (
        <Box sx={{ px: 1.5, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rows.map((row, index) => {
            const actions = row.actions.filter((action) => canEdit || !action.requiresEdit);
            const hidden = actions.length < row.actions.length;
            return (
              <Box key={row.key}>
                {index > 0 && <Divider sx={{ mb: 1 }} />}
                {/* Message and action on one line, wrapping only when there is
                    no room. On a phone each item used to be a paragraph with a
                    full 48px filled orange button under it, so three items were
                    a screen of orange before the first student. */}
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    columnGap: 1,
                    rowGap: 0.5,
                  }}
                >
                  <Typography variant="body2" sx={{ flex: '1 1 180px', minWidth: 0, lineHeight: 1.45 }}>
                    {row.message}
                    {hidden && ' Ask a manager or a teacher with edit access to fix this.'}
                  </Typography>
                  {actions.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0, flexWrap: 'wrap', ml: 'auto' }}>
                      {actions.map((action) => (
                        <Button
                          key={action.key}
                          size="small"
                          variant={action.primary && !isPhone ? 'contained' : 'outlined'}
                          color="warning"
                          onClick={() => onAction(action.key)}
                          sx={{ minHeight: 44, fontWeight: 700, whiteSpace: 'nowrap', textTransform: 'none' }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}
