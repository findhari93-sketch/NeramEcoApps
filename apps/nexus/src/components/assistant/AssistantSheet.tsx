'use client';

import { useId, useMemo, useState } from 'react';
import { Box, Button, Drawer, IconButton, SwipeableDrawer, Tooltip, Typography, alpha, useMediaQuery, useTheme } from '@neram/ui';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ActionCard from './ActionCard';
import { useAssistant } from './AssistantProvider';
import { QUESTION_BANK_FLAG, SKETCHBOOK_FLAG, pageNow, uploadImage } from './client';
import Composer from './Composer';
import { focusRing } from './focusRing';
import { stableHover } from './stableHover';
import MessageBubble from './MessageBubble';
import MessageList from './MessageList';
import QuickActions, { type ExamHelp } from './QuickActions';
import SuggestionChips from './SuggestionChips';

export const SHEET_WIDTH = 420;

import AiStatusLine from './AiStatusLine';

export default function AssistantSheet() {
  const a = useAssistant();
  const { getToken, isFeatureEnabled } = useNexusAuthContext();
  // Ruling 25: no door into a feature the app has switched off.
  const sketchbook = isFeatureEnabled(SKETCHBOOK_FLAG);
  const questionBank = isFeatureEnabled(QUESTION_BANK_FLAG);
  // Read on each open: the practice page changes `?qid=` without a route change.
  const exam: ExamHelp = useMemo(
    () => (!questionBank ? null : pageNow(a.pageContext.path).questionId ? 'question' : 'bank'),
    [questionBank, a.pageContext.path, a.open], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** Bumped by "Ask a maths or exam question": the message box takes focus with a maths prompt. */
  const [askKey, setAskKey] = useState(0);
  const hasChat = a.messages.length > 0 || Boolean(a.pendingAction);
  const theme = useTheme();
  // md is where the bottom nav goes away, so the side drawer takes over there.
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const titleId = useId();
  // The Paper is the panel itself: announce it as a modal dialog named by its heading.
  const dialogProps = { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId } as const;
  // The theme gives Drawer paper `transition: all`, which animates `visibility` too: a kept-mounted
  // sheet stays hidden for 300ms after opening, the focus trap cannot focus it, and focus is never
  // handed back to the launcher. Animate only the slide; visibility then flips at once.
  const paperTransition = { transitionProperty: 'transform' } as const;

  if (!a.enabled) return null;

  const body = (
    // flex: 1 (not height: 100%) so the sheet's drag handle above it is not pushed off screen.
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', '& .Mui-focusVisible': focusRing(theme.palette.primary.main) }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 2, pr: 0.5, py: 0.25, flexShrink: 0, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography id={titleId} variant="subtitle1" component="h2" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '1.0625rem' }}>Neram Assistant</Typography>
        {/* Named in words, not an icon alone, and only once there is a chat to clear:
            on an empty panel it had nothing visible to do. */}
        {hasChat && (
          <Tooltip title="Clear this chat and start again" describeChild>
            <Button
              onClick={() => void a.newChat()}
              startIcon={<AddCommentOutlinedIcon />}
              sx={{ ...stableHover, minHeight: 44, px: 1.25, flexShrink: 0, textTransform: 'none', fontWeight: 700 }}
            >
              New chat
            </Button>
          </Tooltip>
        )}
        <IconButton aria-label="Close" onClick={a.closePanel} sx={{ width: 44, height: 44 }}><CloseIcon /></IconButton>
      </Box>
      <AiStatusLine status={a.aiStatus} />
      {a.messages.length === 0 && a.loadingHistory ? (
        // A kept chat is loading after a reload: a skeleton, not the menu, so a
        // quick action cannot be tapped into the middle of an earlier flow.
        <Box sx={{ flex: 1, minHeight: 0, py: 1 }}><MessageBubble message={{ id: 'history', role: 'assistant', text: '', pending: true }} label="Loading your chat" /></Box>
      ) : a.messages.length === 0 ? (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><QuickActions onSend={(t) => void a.send(t)} onReport={() => void a.reportProblem()} sketchbook={sketchbook} exam={exam} onAsk={() => setAskKey((k) => k + 1)} /></Box>
      ) : (
        <MessageList messages={a.messages} />
      )}
      {a.pendingAction && <ActionCard action={a.pendingAction} busy={a.busy} onConfirm={() => void a.confirm()} onCancel={() => void a.cancel()} />}
      {a.error && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.5 }}>
          <Typography role="alert" variant="body2" color="error" sx={{ flex: 1 }}>{a.error}</Typography>
          {/* The failed message is still on screen; this sends it again, photo and all. */}
          {a.canRetry && (
            <Button variant="text" onClick={() => void a.retry()} disabled={a.busy} sx={{ ...stableHover, minHeight: 44, flexShrink: 0, textTransform: 'none', fontWeight: 700 }}>Try again</Button>
          )}
        </Box>
      )}
      <SuggestionChips items={a.messages.length ? a.suggestions : []} onPick={(s) => void a.send(s)} disabled={a.busy} />
      <Composer onSend={a.send} busy={a.busy} wantsAttachment={a.wantsAttachment} upload={uploadImage} getToken={getToken} allowAttachment={sketchbook} focusKey={askKey} focusPrompt="Type your maths or exam question" />
    </Box>
  );

  if (desktop) {
    return (
      <Drawer anchor="right" open={a.open} onClose={a.closePanel} transitionDuration={reduce ? 0 : undefined} PaperProps={{ ...dialogProps, sx: { ...paperTransition, width: SHEET_WIDTH, maxWidth: '100vw' } }}>
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
        ...dialogProps,
        sx: {
          ...paperTransition,
          borderTopLeftRadius: 16, borderTopRightRadius: 16, height: '92vh', overscrollBehavior: 'contain',
          // dvh follows the phone keyboard and the browser bars where supported.
          '@supports (height: 100dvh)': { height: '92dvh' },
        },
      }}
    >
      <Box aria-hidden sx={{ display: 'flex', justifyContent: 'center', pt: 1, flexShrink: 0 }}>
        <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.secondary, 0.3) }} />
      </Box>
      {body}
    </SwipeableDrawer>
  );
}
