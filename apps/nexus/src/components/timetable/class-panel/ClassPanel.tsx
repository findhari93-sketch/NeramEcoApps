'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Drawer, SwipeableDrawer, useMediaQuery, useTheme } from '@neram/ui';
import ClassPanelHeader from './ClassPanelHeader';
import ClassPanelDialogs from './ClassPanelDialogs';
import ClassPanelEmpty from './ClassPanelEmpty';
import ClassTab from './ClassTab';
import PrepTab from './PrepTab';
import AfterTab from './AfterTab';
import { RADIUS } from '../timetable-theme';
import { deriveClassState, defaultTab, getTimeIndicator, visibleTabs } from './class-state';
import type { ClassPanelTabKey } from './class-state';
import type { ClassPanelProps, ClassPanelTabProps } from './types';

/**
 * Everything about one class, in one component, in every view.
 *
 * There used to be two: a drawer for Day, Week and Month, and an inline edit
 * rail for Plan. Neither was a superset of the other, so the same class offered
 * different features depending on which view a teacher happened to be in, and
 * the two kept separate selections so switching views lost the class entirely.
 *
 * This renders as an overlay (a right drawer at md+, a bottom sheet below) or
 * as a docked column, which is what the planner's right rail is. Same sections,
 * same order, same labels either way. The CALLER picks the variant, because
 * only the caller knows which view it is in; the panel deliberately knows
 * nothing about view modes.
 */
export default function ClassPanel({
  cls,
  open = false,
  onClose,
  variant = 'drawer',
  ...rest
}: ClassPanelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [tab, setTab] = useState<ClassPanelTabKey>('class');
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);
  const [recordingOpen, setRecordingOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { role, prep, assignments } = rest;

  // Derived here and passed down, so no tab can acquire its own copy of the
  // truth about what state this class is in.
  const state = useMemo(() => (cls ? deriveClassState(cls, role, prep) : null), [cls, role, prep]);
  const tabs = useMemo(
    () => (state ? visibleTabs(state, role, { assignments, prep }) : []),
    [state, role, assignments, prep],
  );

  // EVERY hook must sit above the null return below. The docked variant renders
  // its empty state when cls is null, so this component genuinely alternates
  // between having a class and not, and a hook below the early return would
  // change count between renders.
  useEffect(() => {
    if (!cls || !state) return;
    setTab(defaultTab(state, role, variant, { assignments, prep }));
    setConfirmAction(null);
    setRecordingOpen(false);
    setShareOpen(false);
    // Keyed on the class, not on `state`: state is rebuilt every render from a
    // live clock, and depending on it would reset the teacher's tab underneath
    // them the moment a countdown ticked over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls?.id, variant, role]);

  if (!cls || !state) {
    // The overlay has nothing to say with nothing selected; the docked column
    // is part of the layout and must hold its place.
    return variant === 'docked' ? <ClassPanelEmpty /> : null;
  }

  const activeTab = tabs.includes(tab) ? tab : 'class';

  const tabProps: ClassPanelTabProps = {
    ...rest,
    cls,
    state,
    timeIndicator: getTimeIndicator(cls, state),
    onOpenRecording: () => setRecordingOpen(true),
    onOpenShare: () => setShareOpen(true),
    onConfirm: setConfirmAction,
  };

  const body = (
    <>
      <ClassPanelHeader
        cls={cls}
        state={state}
        timeIndicator={tabProps.timeIndicator}
        tabs={tabs}
        tab={activeTab}
        onTabChange={setTab}
        showClose={variant === 'drawer'}
        onClose={onClose}
      />
      <Box sx={{ p: 2, flex: variant === 'drawer' ? 1 : undefined, minHeight: 0 }}>
        {activeTab === 'prep' ? (
          <PrepTab {...tabProps} />
        ) : activeTab === 'after' ? (
          <AfterTab {...tabProps} />
        ) : (
          <ClassTab {...tabProps} />
        )}
      </Box>
    </>
  );

  // Rendered once, as a sibling of whichever container is chosen below. Putting
  // it inside a branch is what once left the confirm dialog and the recording
  // player unmounted on mobile.
  const dialogs = (
    <ClassPanelDialogs
      cls={cls}
      role={role}
      getToken={rest.getToken}
      hasRecording={state.hasRecording}
      confirmAction={confirmAction}
      onCloseConfirm={() => setConfirmAction(null)}
      onDelete={rest.onDelete}
      onDeletePermanent={rest.onDeletePermanent}
      recordingOpen={recordingOpen}
      onCloseRecording={() => setRecordingOpen(false)}
      shareOpen={shareOpen}
      onCloseShare={() => setShareOpen(false)}
      onNotify={rest.onNotify}
    />
  );

  if (variant === 'docked') {
    return (
      <>
        {/* No height cap and no scroller of its own: the planner column around
            it owns the scroll, which is what makes the sticky header work. */}
        <Box
          sx={{
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: RADIUS.card,
            bgcolor: 'background.paper',
            overflow: 'hidden',
          }}
        >
          {body}
        </Box>
        {dialogs}
      </>
    );
  }

  if (isMobile) {
    return (
      <>
        <SwipeableDrawer
          anchor="bottom"
          open={open}
          onClose={() => onClose?.()}
          onOpen={() => {}}
          disableSwipeToOpen
          PaperProps={{
            sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85vh' },
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1, flex: '0 0 auto' }}>
            <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'grey.300' }} />
          </Box>
          {/* The scroller sits inside the sheet, below the drag handle, so the
              handle stays put and the sticky header sticks to the top of the
              content rather than scrolling away under it. */}
          <Box sx={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {body}
          </Box>
        </SwipeableDrawer>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={() => onClose?.()}
        PaperProps={{ sx: { width: 380 } }}
      >
        <Box sx={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          {body}
        </Box>
      </Drawer>
      {dialogs}
    </>
  );
}
