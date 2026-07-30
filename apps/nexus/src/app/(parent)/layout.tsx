'use client';

import { Box, Container } from '@neram/ui';
import { usePathname } from 'next/navigation';
import { isFullBleedRoute } from '@/lib/full-bleed-routes';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSidebarContext } from '@/components/SidebarProvider';

/**
 * Four tabs, so a bottom nav fits a 375px screen with 48px targets.
 *
 * Trimmed from the previous five. `/parent/checklist` was a nav entry with no
 * page behind it (a guaranteed 404), and `/parent/library/engagement` was backed
 * by a query against a `users.linked_student_ids` column that exists in no
 * migration, so it could only ever render "No linked child found".
 *
 * A tab lands in the same change that ships its page, never before it. Help is
 * still to come and so is its tab.
 *
 * "Work" rather than "Assignments": at four tabs each gets about 93px on a
 * 375px screen, and the longer word crowds its neighbours at the 0.6875rem
 * BottomNav size. The page heading is still "Assignments", which is what a
 * parent will have heard from the school.
 *
 * Four fits without an overflow sheet. A fifth would push "More" into the bar
 * and bury one of these behind a tap.
 */
const parentNavItems = [
  { label: 'Home', path: '/parent/dashboard', icon: <HomeOutlinedIcon /> },
  { label: 'Classes', path: '/parent/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Work', path: '/parent/assignments', icon: <AssignmentOutlinedIcon /> },
  { label: 'Tests', path: '/parent/tests', icon: <FactCheckOutlinedIcon /> },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const { sidebarWidth } = useSidebarContext();
  const fullBleed = isFullBleedRoute(usePathname());

  return (
    // loginPath matters: a parent whose 12-hour session expired has no Microsoft
    // account, so the default /login would strand them on a sign-in screen they
    // can never complete.
    <RoleGuard allowedRoles={['parent']} loginPath="/parent/login">
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <DesktopSidebar items={parentNavItems} />

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: '100vh',
            ml: { md: `${sidebarWidth}px` },
            transition: 'margin-left 250ms cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          <TopBar />
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              bgcolor: (theme) => theme.palette.mode === 'light' ? '#FAFAFA' : 'background.default',
              pt: fullBleed ? 0 : { xs: 2, md: 3 },
              pb: fullBleed ? { xs: 8, md: 0 } : { xs: 10, md: 3 },
              px: fullBleed ? 0 : { xs: 2, sm: 3, md: 4 },
            }}
          >
            <Container maxWidth={fullBleed ? false : 'md'} disableGutters>
              {children}
            </Container>
          </Box>
          <BottomNav items={parentNavItems} />
        </Box>
      </Box>
    </RoleGuard>
  );
}
