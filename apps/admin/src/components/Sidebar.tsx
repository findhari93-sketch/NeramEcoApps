'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Avatar,
  Tooltip,
  IconButton,
  Badge,
} from '@neram/ui';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import PaymentIcon from '@mui/icons-material/Payment';
import BookIcon from '@mui/icons-material/Book';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import VideocamIcon from '@mui/icons-material/Videocam';
import QuizIcon from '@mui/icons-material/Quiz';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import SchoolIcon from '@mui/icons-material/School';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import CampaignIcon from '@mui/icons-material/Campaign';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import RateReviewIcon from '@mui/icons-material/RateReview';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ForumIcon from '@mui/icons-material/Forum';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EventNoteIcon from '@mui/icons-material/EventNote';
import GavelIcon from '@mui/icons-material/Gavel';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import WorkIcon from '@mui/icons-material/Work';
import FeedbackIcon from '@mui/icons-material/Feedback';
import DevicesIcon from '@mui/icons-material/Devices';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useMicrosoftAuth } from '@neram/auth';
import NotificationBell from './NotificationBell';
import { useSidebar } from '@/contexts/SidebarContext';

const TRANSITION = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
const MOBILE_DRAWER_WIDTH = 280;

interface MenuItem {
  text: string;
  icon: typeof DashboardIcon;
  path: string;
  hasBadge?: boolean | string;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    label: 'Overview',
    items: [
      { text: 'Dashboard', icon: DashboardIcon, path: '/' },
    ],
  },
  {
    label: 'People & CRM',
    items: [
      { text: 'Users (CRM)', icon: PeopleIcon, path: '/crm' },
      { text: 'Students', icon: SchoolIcon, path: '/students' },
      { text: 'Student Devices', icon: DevicesIcon, path: '/devices' },
      { text: 'Direct Enroll', icon: PersonAddAlt1Icon, path: '/direct-enrollment' },
      { text: 'Student Onboarding', icon: AssignmentTurnedInIcon, path: '/student-onboarding' },
      { text: 'Demo Classes', icon: VideocamIcon, path: '/demo-classes' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { text: 'Courses', icon: BookIcon, path: '/courses' },
      { text: 'Onboarding', icon: QuizIcon, path: '/onboarding' },
      { text: 'NATA Content', icon: ArchitectureIcon, path: '/nata' },
      { text: 'Counseling', icon: GavelIcon, path: '/counseling' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { text: 'Payments', icon: PaymentIcon, path: '/payments' },
      { text: 'Fee Structures', icon: AttachMoneyIcon, path: '/fee-structures' },
    ],
  },
  {
    label: 'Exams',
    items: [
      { text: 'Exam Centers', icon: LocationOnIcon, path: '/exam-centers' },
      { text: 'Exam Schedule', icon: EventNoteIcon, path: '/exam-schedule' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { text: 'Messages', icon: MailOutlinedIcon, path: '/messages', hasBadge: true },
      { text: 'Support Tickets', icon: SupportAgentIcon, path: '/support-tickets' },
      { text: 'App Feedback', icon: FeedbackIcon, path: '/feedback' },
      { text: 'WhatsApp Templates', icon: WhatsAppIcon, path: '/whatsapp-templates' },
      { text: 'Q&A Moderation', icon: RateReviewIcon, path: '/question-moderation' },
      { text: 'Chat History', icon: ForumIcon, path: '/chat-history' },
      { text: 'Aintra Training', icon: SmartToyIcon, path: '/aintra-kb' },
      { text: 'Training Guide', icon: MenuBookIcon, path: '/aintra-guide' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { text: 'Marketing Content', icon: CampaignIcon, path: '/marketing-content' },
      { text: 'Testimonials', icon: FormatQuoteIcon, path: '/testimonials' },
      { text: 'Social Proofs', icon: GraphicEqIcon, path: '/social-proofs' },
      { text: 'Careers', icon: WorkIcon, path: '/careers', hasBadge: 'careers' },
    ],
  },
  {
    label: 'System',
    items: [
      { text: 'Settings', icon: SettingsIcon, path: '/settings' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useMicrosoftAuth();
  const { collapsed, toggleSidebar, sidebarWidth, isMobile, mobileOpen, setMobileOpen } = useSidebar();
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [careersNewCount, setCareersNewCount] = useState(0);
  const messageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const careersIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessageUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/unread-count');
      if (res.ok) {
        const data = await res.json();
        setMessageUnreadCount(data.count || 0);
      }
    } catch {
      // Silently fail for badge count
    }
  }, []);

  const fetchCareersNewCount = useCallback(async () => {
    try {
      const res = await fetch('/api/careers/applications/count');
      if (res.ok) {
        const data = await res.json();
        setCareersNewCount(data.count || 0);
      }
    } catch {
      // Silently fail for badge count
    }
  }, []);

  useEffect(() => {
    fetchMessageUnreadCount();
    fetchCareersNewCount();
    messageIntervalRef.current = setInterval(fetchMessageUnreadCount, 60000);
    careersIntervalRef.current = setInterval(fetchCareersNewCount, 60000);
    return () => {
      if (messageIntervalRef.current) {
        clearInterval(messageIntervalRef.current);
      }
      if (careersIntervalRef.current) {
        clearInterval(careersIntervalRef.current);
      }
    };
  }, [fetchMessageUnreadCount, fetchCareersNewCount]);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  const renderIcon = (item: MenuItem) => {
    const Icon = item.icon;
    const iconEl = <Icon sx={{ fontSize: 18 }} />;

    if (item.hasBadge === true && messageUnreadCount > 0) {
      return <Badge badgeContent={messageUnreadCount} color="error" max={99}>{iconEl}</Badge>;
    }
    if (item.hasBadge === 'careers' && careersNewCount > 0) {
      return <Badge badgeContent={careersNewCount} color="error" max={99}>{iconEl}</Badge>;
    }
    return iconEl;
  };

  const showCollapsed = !isMobile && collapsed;

  const drawerContent = (
    <>
      {/* Header — brand + bell + collapse toggle */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: showCollapsed ? 'center' : 'space-between',
          px: showCollapsed ? 0.5 : 2,
          py: 1.5,
          minHeight: 48,
          borderBottom: '1px solid',
          borderColor: 'divider',
          transition: TRANSITION,
        }}
      >
        {!showCollapsed ? (
          <>
            <Typography
              variant="body2"
              component="h1"
              fontWeight={700}
              noWrap
              sx={{ fontSize: 14, color: 'text.primary' }}
            >
              Neram Classes
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <NotificationBell />
              {!isMobile && (
                <IconButton
                  onClick={toggleSidebar}
                  size="small"
                  sx={{ width: 24, height: 24, color: 'text.secondary' }}
                >
                  <ChevronLeftIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Box>
          </>
        ) : (
          <IconButton
            onClick={toggleSidebar}
            size="small"
            sx={{ width: 28, height: 28, color: 'text.secondary' }}
          >
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>

      {/* Grouped navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
        {menuGroups.map((group) => (
          <Box key={group.label} sx={{ mb: 0.5 }}>
            {/* Section label — hidden when collapsed */}
            {!showCollapsed && (
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#9CA3AF',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  px: 2,
                  pt: 1.5,
                  pb: 0.5,
                  userSelect: 'none',
                }}
              >
                {group.label}
              </Typography>
            )}
            <List disablePadding sx={{ px: showCollapsed ? 0.5 : 0.75 }}>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.path ||
                  (item.path !== '/' && pathname.startsWith(item.path));

                const handleNavClick = () => {
                  router.push(item.path);
                  if (isMobile) setMobileOpen(false);
                };

                const button = (
                  <ListItemButton
                    onClick={handleNavClick}
                    selected={isActive}
                    sx={{
                      borderRadius: 1.5,
                      justifyContent: showCollapsed ? 'center' : 'flex-start',
                      px: showCollapsed ? 1 : 1.5,
                      py: 0.5,
                      minHeight: isMobile ? 44 : 34,
                      transition: TRANSITION,
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: showCollapsed ? 'auto' : 32,
                        justifyContent: 'center',
                      }}
                    >
                      {renderIcon(item)}
                    </ListItemIcon>
                    {!showCollapsed && (
                      <ListItemText
                        primary={item.text}
                        primaryTypographyProps={{
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 400,
                        }}
                      />
                    )}
                  </ListItemButton>
                );

                return (
                  <ListItem key={item.text} disablePadding sx={{ mb: '1px' }}>
                    {showCollapsed ? (
                      <Tooltip title={item.text} placement="right" arrow>
                        {button}
                      </Tooltip>
                    ) : (
                      button
                    )}
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* User row at bottom */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: showCollapsed ? 'center' : 'space-between',
          px: showCollapsed ? 0.5 : 2,
          py: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          minHeight: 44,
          transition: TRANSITION,
        }}
      >
        {!showCollapsed ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: 12,
                  bgcolor: '#E5E7EB',
                  color: '#374151',
                }}
              >
                {user?.name?.charAt(0) || 'A'}
              </Avatar>
              <Typography variant="caption" fontWeight={500} noWrap sx={{ flex: 1, minWidth: 0, color: 'text.primary' }}>
                {user?.name || 'Admin'}
              </Typography>
            </Box>
            <Tooltip title="Logout" placement="top" arrow>
              <IconButton onClick={handleLogout} size="small" sx={{ width: 24, height: 24, color: 'text.secondary' }}>
                <LogoutIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Tooltip title={`${user?.name || 'Admin'} — Logout`} placement="right" arrow>
            <IconButton onClick={handleLogout} size="small" sx={{ width: 32, height: 32 }}>
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: 12,
                  bgcolor: '#E5E7EB',
                  color: '#374151',
                }}
              >
                {user?.name?.charAt(0) || 'A'}
              </Avatar>
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': {
            width: MOBILE_DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: sidebarWidth,
        flexShrink: 0,
        transition: TRANSITION,
        '& .MuiDrawer-paper': {
          width: sidebarWidth,
          boxSizing: 'border-box',
          transition: TRANSITION,
          overflowX: 'hidden',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
