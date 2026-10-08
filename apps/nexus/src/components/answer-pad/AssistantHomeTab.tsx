'use client';

/**
 * The Neram Assistant's own tab in Teams: what opens when someone clicks one of
 * its Activity items.
 *
 * A click carries the notification's id (the deep link's subEntityId, read here
 * as `context.page.subPageId`), so the tab opens on that notification in full
 * with an "Open in Nexus" button to the exact page. Opened directly, it lists
 * the viewer's recent notifications. Both read with the Teams sign-in token.
 *
 * It used to be /student/assignments itself, which Nexus refuses to let any
 * other site frame (X-Frame-Options: SAMEORIGIN), so every Activity item opened
 * a broken page. Letting that page be framed would not have helped either: it
 * signs in through a Microsoft redirect, and Microsoft's sign-in page refuses to
 * render inside a frame too. So this tab lives under /pad/teams, the one place
 * Teams may frame, needs no sign-in, and hands the student to Nexus in their
 * browser, where they are already signed in.
 */

import { useEffect, useState } from 'react';
import AssignmentRounded from '@mui/icons-material/AssignmentRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import EventNoteRounded from '@mui/icons-material/EventNoteRounded';
import HistoryEduRounded from '@mui/icons-material/HistoryEduRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import type { SvgIconComponent } from '@mui/icons-material';
import { Box, Stack, Typography } from '@neram/ui';
import PadShell from './PadShell';
import { cachedTokenGetter, themeFromTeams, type PadTheme } from '@/lib/pad/client/pad-host';
import { notificationIdFromContext } from '@/lib/assistant-tab-link';
import { AssistantNotificationView, AssistantRecentList, type TokenGetter } from './AssistantNotificationView';

const INIT_TIMEOUT_MS = 5_000;

export interface AssistantHomeLink {
  label: string;
  hint: string;
  /** Relative, so the tab opens the Nexus it is served from (production, staging or local). */
  href: string;
  Icon: SvgIconComponent;
}

export const ASSISTANT_HOME_LINKS: AssistantHomeLink[] = [
  { label: 'My work', hint: 'Assignments and what is due', href: '/student/assignments', Icon: AssignmentRounded },
  { label: 'Catch up', hint: 'Classes you missed', href: '/student/catch-up', Icon: HistoryEduRounded },
  { label: 'Timetable', hint: 'Your upcoming classes', href: '/student/timetable', Icon: EventNoteRounded },
];

export default function AssistantHomeTab() {
  const [theme, setTheme] = useState<PadTheme>('light');
  /** Null outside Teams, where there is no Teams sign-in and the links below are all there is. */
  const [getToken, setGetToken] = useState<TokenGetter | null>(null);
  /** The notification on screen, and whether Back returns to the list. */
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { app, authentication } = await import('@microsoft/teams-js');
        await Promise.race([
          app.initialize(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), INIT_TIMEOUT_MS)),
        ]);
        const context = await app.getContext();
        if (!active) return;
        setTheme(themeFromTeams(context.app?.theme));
        app.registerOnThemeChangeHandler((next) => {
          if (active) setTheme(themeFromTeams(next));
        });
        const getter = cachedTokenGetter(() => authentication.getAuthToken());
        setGetToken(() => getter);
        setOpenId(notificationIdFromContext(context));
        void app.notifySuccess();
      } catch {
        // Opened outside Teams: the links work the same in a plain browser tab.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (getToken && openId) {
    return (
      <PadShell theme={theme}>
        <AssistantNotificationView id={openId} getToken={getToken} onBack={() => setOpenId(null)} />
      </PadShell>
    );
  }

  return (
    <PadShell theme={theme}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h5" component="h1" fontWeight={800}>
            Neram Assistant
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Your Nexus work opens in your browser.
          </Typography>
        </Box>

        {getToken && <AssistantRecentList getToken={getToken} onOpen={setOpenId} />}

        {!getToken && (
          <Stack component="nav" aria-label="Open in Nexus" spacing={1}>
            {ASSISTANT_HOME_LINKS.map(({ label, hint, href, Icon }) => (
              <Box
                key={href}
                component="a"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${label}, opens Nexus in a new tab`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  minHeight: 64,
                  px: 2,
                  py: 1.25,
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  color: 'text.primary',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  transition: 'border-color 150ms ease, background-color 150ms ease',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
                }}
              >
                <Icon aria-hidden sx={{ color: 'primary.main', fontSize: 28, flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={700}>{label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {hint}
                  </Typography>
                </Box>
                <OpenInNewRounded aria-hidden fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
              </Box>
            ))}
          </Stack>
        )}

        <Stack direction="row" spacing={1} alignItems="flex-start">
          <ChatBubbleOutlineRounded aria-hidden fontSize="small" sx={{ color: 'text.secondary', mt: '2px' }} />
          <Typography variant="body2" color="text.secondary">
            Messages from Neram Assistant arrive here in Teams. Tap one to see it in full, then open it in Nexus.
          </Typography>
        </Stack>
      </Stack>
    </PadShell>
  );
}
