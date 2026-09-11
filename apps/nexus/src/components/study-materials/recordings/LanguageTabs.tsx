'use client';

/**
 * One tab per language, each saying where its recording stands.
 *
 * The status is written under the language and carries an icon, so it never
 * depends on colour alone. Full width when there are three or fewer languages
 * (English and Tamil today), scrollable once an admin adds more.
 */

import { Box, Tab, Tabs, Typography } from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import type { FlowStage } from '@/lib/recording-flow';

export interface LanguageTab {
  code: string;
  label: string;
  status: string;
  stage: FlowStage;
}

function statusLook(stage: FlowStage): { icon: React.ReactNode; color: string } {
  switch (stage) {
    case 'live':
    case 'live_open':
      return { icon: <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />, color: 'success.main' };
    case 'video_problem':
    case 'on_hold':
      return { icon: <ReportProblemOutlinedIcon sx={{ fontSize: 16 }} />, color: 'warning.dark' };
    case 'no_video':
      return { icon: <AddCircleOutlineRoundedIcon sx={{ fontSize: 16 }} />, color: 'text.secondary' };
    default:
      return { icon: <EditNoteRoundedIcon sx={{ fontSize: 16 }} />, color: 'text.secondary' };
  }
}

export const tabId = (code: string) => `recording-tab-${code}`;
export const panelId = (code: string) => `recording-panel-${code}`;

export default function LanguageTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: LanguageTab[];
  value: string;
  onChange: (code: string) => void;
}) {
  const few = tabs.length <= 3;
  return (
    <Tabs
      value={value}
      onChange={(_, next: string) => onChange(next)}
      variant={few ? 'fullWidth' : 'scrollable'}
      scrollButtons={few ? false : 'auto'}
      allowScrollButtonsMobile
      aria-label="Recording languages"
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        '& .MuiTab-root': { minHeight: 64, textTransform: 'none', alignItems: 'flex-start', px: 2, py: 1 },
      }}
    >
      {tabs.map((tab) => {
        const look = statusLook(tab.stage);
        return (
          <Tab
            key={tab.code}
            value={tab.code}
            id={tabId(tab.code)}
            aria-controls={panelId(tab.code)}
            label={
              // A span, not a div: the tab is a <button>, which may only hold phrasing content.
              <Box component="span" sx={{ display: 'block', textAlign: 'left', width: '100%' }}>
                <Typography component="span" sx={{ display: 'block', fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
                  {tab.label}
                </Typography>
                <Box
                  component="span"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.8125rem', color: look.color }}
                >
                  {look.icon}
                  {tab.status}
                </Box>
              </Box>
            }
          />
        );
      })}
    </Tabs>
  );
}
