'use client';

import { useCallback } from 'react';
import { Box, Drawer, IconButton, SwipeableDrawer, Typography, alpha, useMediaQuery, useTheme } from '@neram/ui';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ActionCard from './ActionCard';
import { useAssistant } from './AssistantProvider';
import { uploadImage } from './client';
import Composer from './Composer';
import MessageList from './MessageList';
import QuickActions from './QuickActions';
import SuggestionChips from './SuggestionChips';

export const SHEET_WIDTH = 420;

export default function AssistantSheet() {
  const a = useAssistant();
  const { getToken } = useNexusAuthContext();
  const theme = useTheme();
  // md is where the bottom nav goes away, so the side drawer takes over there.
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { setDraft } = a;
  const onEdit = useCallback(() => setDraft('Change: '), [setDraft]);
  const onDraftConsumed = useCallback(() => setDraft(''), [setDraft]);

  if (!a.enabled) return null;

  const body = (
    // flex: 1 (not height: 100%) so the sheet's drag handle above it is not pushed off screen.
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="h6" component="h2" sx={{ flex: 1, fontWeight: 700 }}>Neram Assistant</Typography>
        <IconButton aria-label="New chat" onClick={() => void a.newChat()} sx={{ width: 48, height: 48 }}><AddCommentOutlinedIcon /></IconButton>
        <IconButton aria-label="Close" onClick={a.closePanel} sx={{ width: 48, height: 48 }}><CloseIcon /></IconButton>
      </Box>
      {a.messages.length === 0 ? (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><QuickActions onSend={(t) => void a.send(t)} onReport={() => void a.reportProblem()} /></Box>
      ) : (
        <MessageList messages={a.messages} />
      )}
      {a.pendingAction && <ActionCard action={a.pendingAction} busy={a.busy} onConfirm={() => void a.confirm()} onEdit={onEdit} onCancel={() => void a.cancel()} />}
      {a.error && <Typography role="alert" variant="body2" color="error" sx={{ px: 2, py: 1 }}>{a.error}</Typography>}
      <SuggestionChips items={a.messages.length ? a.suggestions : []} onPick={(s) => void a.send(s)} disabled={a.busy} />
      <Composer onSend={a.send} busy={a.busy} wantsAttachment={a.wantsAttachment} draft={a.draft} onDraftConsumed={onDraftConsumed} upload={uploadImage} getToken={getToken} />
    </Box>
  );

  if (desktop) {
    return (
      <Drawer anchor="right" open={a.open} onClose={a.closePanel} transitionDuration={reduce ? 0 : undefined} PaperProps={{ sx: { width: SHEET_WIDTH, maxWidth: '100vw' }, 'aria-label': 'Neram Assistant' } as never}>
        {body}
      </Drawer>
    );
  }
  return (
    <SwipeableDrawer
      anchor="bottom"
      open={a.open}
      onClose={a.closePanel}
      onOpen={() => a.openPanel()}
      disableSwipeToOpen
      swipeAreaWidth={0}
      transitionDuration={reduce ? 0 : undefined}
      slotProps={{ backdrop: { sx: { bgcolor: alpha(theme.palette.common.black, 0.3) } } }}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16, borderTopRightRadius: 16, height: '85vh', overscrollBehavior: 'contain',
          // dvh follows the phone keyboard and the browser bars where supported.
          '@supports (height: 100dvh)': { height: '85dvh' },
        },
        'aria-label': 'Neram Assistant',
      } as never}
    >
      <Box aria-hidden sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, flexShrink: 0 }}>
        <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.secondary, 0.3) }} />
      </Box>
      {body}
    </SwipeableDrawer>
  );
}
