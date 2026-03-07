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
import ArchitectureIcon from '@mui/icons-material/Architecture';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EventNoteIcon from '@mui/icons-material/EventNote';
import GavelIcon from '@mui/icons-material/Gavel';
import { useMicrosoftAuth } from '@neram/auth';
import NotificationBell from './NotificationBell';
import { useSidebar } from '@/contexts/SidebarContext';

const TRANSITION = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

const menuItems = [
  { text: 'Dashboard', icon: DashboardIcon, path: '/' },
  { text: 'Users (CRM)', icon: PeopleIcon, path: '/crm' },
  { text: 'Demo Classes', icon: VideocamIcon, path: '/demo-classes' },
  { text: 'Students', icon: SchoolIcon, path: '/students' },
  { text: 'Direct Enroll', icon: PersonAddAlt1Icon, path: '/direct-enrollment' },
  { text: 'Payments', icon: PaymentIcon, path: '/payments' },
  { text: 'Courses', icon: BookIcon, path: '/courses' },
  { text: 'Onboarding', icon: QuizIcon, path: '/onboarding' },
  { text: 'Fee Structures', icon: AttachMoneyIcon, path: '/fee-structures' },
  { text: 'Messages', icon: MailOutlinedIcon, path: '/messages', hasBadge: true },
  { text: 'Marketing Content', icon: CampaignIcon, path: '/marketing-content' },
  { text: 'Testimonials', icon: FormatQuoteIcon, path: '/testimonials' },
  { text: 'Social Proofs', icon: GraphicEqIcon, path: '/social-proofs' },
  { text: 'Q&A Moderation', icon: RateReviewIcon, path: '/question-moderation' },
  { text: 'Support Tickets', icon: SupportAgentIcon, path: '/support-tickets' },
  { text: 'Exam Centers', icon: LocationOnIcon, path: '/exam-centers' },
  { text: 'Exam Schedule', icon: EventNoteIcon, path: '/exam-schedule' },
  { text: 'NATA Content', icon: ArchitectureIcon, path: '/nata' },
  { text: 'Counseling', icon: GavelIcon, path: '/counseling' },
  { text: 'Settings', icon: SettingsIcon, path: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useMicrosoftAuth();
  const { collapsed, toggleSidebar, sidebarWidth } = useSidebar();
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const messageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    fetchMessageUnreadCount();
    messageIntervalRef.current = setInterval(fetchMessageUnreadCount, 60000);
    return () => {
      if (messageIntervalRef.current) {
        clearInterval(messageIntervalRef.current);
      }
    };
  }, [fetchMessageUnreadCount]);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

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
          borderRight: '1px solid',
          borderColor: 'divider',
          transition: TRANSITION,
          overflowX: 'hidden',
        },
      }}
    >
      {/* Compact header row — logo + bell + collapse chevron */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 0.5 : 1.5,
          py: 1,
          minHeight: 40,
          transition: TRANSITION,
        }}
      >
        {!collapsed ? (
          <>
            <Typography
              variant="body2"
              component="h1"
              fontWeight={700}
              color="primary"
              noWrap
              sx={{ fontSize: 13 }}
            >
              Neram Classes
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <NotificationBell />
              <IconButton
                onClick={toggleSidebar}
                size="small"
                sx={{ width: 22, height: 22 }}
              >
                <ChevronLeftIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
            <IconButton
              onClick={toggleSidebar}
              size="small"
              sx={{ width: 22, height: 22 }}
            >
              <ChevronRightIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        )}
      </Box>

      {/* Navigation — no dividers, tight items */}
      <List sx={{ px: collapsed ? 0.25 : 0.5, py: 0.25, flexGrow: 1 }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.path ||
            (item.path !== '/' && pathname.startsWith(item.path));

          const button = (
            <ListItemButton
              onClick={() => router.push(item.path)}
              selected={isActive}
              sx={{
                borderRadius: 1,
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 0.75 : 1,
                transition: TRANSITION,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'primary.contrastText',
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: collapsed ? 'auto' : 28,
                  justifyContent: 'center',
                }}
              >
                {item.hasBadge && messageUnreadCount > 0 ? (
                  <Badge badgeContent={messageUnreadCount} color="error" max={99}>
                    <Icon sx={{ fontSize: 16 }} />
                  </Badge>
                ) : (
                  <Icon sx={{ fontSize: 16 }} />
                )}
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: 13 }}
                />
              )}
            </ListItemButton>
          );

          return (
            <ListItem key={item.text} disablePadding>
              {collapsed ? (
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

      {/* Compact user row at bottom — Vercel style */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 0.5 : 1.5,
          py: 0.75,
          borderTop: '1px solid',
          borderColor: 'divider',
          minHeight: 36,
          transition: TRANSITION,
        }}
      >
        {!collapsed ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flex: 1 }}>
              <Avatar sx={{ width: 24, height: 24, fontSize: 11 }}>
                {user?.name?.charAt(0) || 'A'}
              </Avatar>
              <Typography variant="caption" fontWeight={500} noWrap sx={{ flex: 1, minWidth: 0 }}>
                {user?.name || 'Admin'}
              </Typography>
            </Box>
            <Tooltip title="Logout" placement="top" arrow>
              <IconButton onClick={handleLogout} size="small" sx={{ width: 22, height: 22, color: 'text.secondary' }}>
                <LogoutIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Tooltip title={`${user?.name || 'Admin'} — Logout`} placement="right" arrow>
            <IconButton onClick={handleLogout} size="small" sx={{ width: 28, height: 28 }}>
              <Avatar sx={{ width: 24, height: 24, fontSize: 11 }}>
                {user?.name?.charAt(0) || 'A'}
              </Avatar>
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Drawer>
  );
}
