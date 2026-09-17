'use client';

/**
 * The page Teams shows when the Answer Pad is added to a meeting, a chat or a
 * channel. There is nothing to choose: the class is worked out from the meeting
 * when the teacher opens the panel. Saving points the tab at /pad/teams.
 */

import { useEffect, useState } from 'react';
import { Alert, Stack, Typography } from '@neram/ui';
import PadShell from '@/components/answer-pad/PadShell';
import { themeFromTeams, type PadTheme } from '@/lib/pad/client/pad-host';
import { answerPadTab } from '@/lib/pad/teams-tab';

const INIT_TIMEOUT_MS = 5_000;

export default function AnswerPadTabConfigPage() {
  const [outsideTeams, setOutsideTeams] = useState(false);
  const [theme, setTheme] = useState<PadTheme>('light');

  useEffect(() => {
    let active = true;

    void (async () => {
      const { app, pages } = await import('@microsoft/teams-js');
      try {
        await Promise.race([
          app.initialize(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), INIT_TIMEOUT_MS)),
        ]);
      } catch {
        if (active) setOutsideTeams(true);
        return;
      }

      const context = await app.getContext();
      if (!active) return;
      setTheme(themeFromTeams(context.app?.theme));

      // The same tab Nexus pins through Graph when it adds the pad to a class meeting.
      const tab = answerPadTab(window.location.origin);
      pages.config.registerOnSaveHandler((saveEvent) => {
        pages.config
          .setConfig({
            contentUrl: tab.contentUrl,
            websiteUrl: tab.websiteUrl,
            entityId: tab.entityId,
            suggestedDisplayName: tab.displayName,
          })
          .then(() => saveEvent.notifySuccess())
          .catch(() => saveEvent.notifyFailure('The Answer Pad could not be added. Please try again.'));
      });
      pages.config.setValidityState(true);
      void app.notifySuccess();
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <PadShell theme={theme}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h1" fontWeight={800}>
          Answer Pad
        </Typography>
        <Typography>
          Ask a question out loud or on your slide, and students answer from their side panel. You see who answered, who got it
          right, and who stayed silent.
        </Typography>
        <Typography color="text.secondary">
          There is nothing to set up. Select Save, then open the Answer Pad from the meeting toolbar during class.
        </Typography>
        {outsideTeams && <Alert severity="info">This page only works inside Teams, when you add the Answer Pad to a meeting.</Alert>}
      </Stack>
    </PadShell>
  );
}
