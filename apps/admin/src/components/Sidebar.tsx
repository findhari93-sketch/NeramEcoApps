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
  Divider,
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
import { useMicrosoftAuth } from '@neram/auth';
import NotificationBell from './NotificationBell';
import { useSidebar } from '@/contexts/SidebarContext';

const TRANSITION = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

const menuItems = [
  { text: 'Dashboard', icon: DashboardIcon, path: '/' },
  { text: 'Users (CRM)', icon: PeopleIcon, path: '/crm' },
  { text: 'Demo Classes', icon: VideocamIcon, path: '/demo-classes' },
  { text: 'Students', icon: SchoolIcon, path: '/students' },
  { text: 'Payments', icon: PaymentIcon, path: '/payments' },
  { text: 'Courses', icon: BookIcon, path: '/courses' },
  { text: 'Onboarding', icon: QuizIcon, path: '/onboarding' },
  { text: 'Fee Structures', icon: AttachMoneyIcon, path: '/fee-structures' },
  { text: 'Messages', icon: MailOutlinedIcon, path: '/messages', hasBadge: true },
  { text: 'Marketing Content', icon: CampaignIcon, path: '/marketing-content' },
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
    // Poll every 60 seconds
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
      {/* Header */}
      <Box
        sx={{
          p: collapsed ? 1.5 : 3,
          pb: collapsed ? 1 : 2,
          position: 'relative',
          transition: TRANSITION,
        }}
      >
        {!collapsed ? (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="h5" component="h1" fontWeight="bold" color="primary">
                Neram Classes
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Admin Panel
              </Typography>
            </Box>
            <NotificationBell />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Typography
              variant="h6"
              fontWeight="bold"
              color="primary"
              sx={{ fontSize: 20, lineHeight: 1.2 }}
            >
              N
            </Typography>
            <NotificationBell />
          </Box>
        )}
      </Box>

      <Divider />

      {/* Toggle button */}
      <Box sx={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', px: 1, py: 0.5 }}>
        <IconButton
          onClick={toggleSidebar}
          size="small"
          sx={{
            width: 28,
            height: 28,
            bgcolor: 'grey.100',
            '&:hover': { bgcolor: 'grey.200' },
          }}
        >
          {collapsed ? (
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          ) : (
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          )}
        </IconButton>
      </Box>

      {/* Navigation */}
      <List sx={{ px: collapsed ? 1 : 2, py: 1, flexGrow: 1 }}>
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
                px: collapsed ? 1.5 : 2,
                minHeight: 44,
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
                  minWidth: collapsed ? 'auto' : 40,
                  justifyContent: 'center',
                }}
              >
                {item.hasBadge && messageUnreadCount > 0 ? (
                  <Badge badgeContent={messageUnreadCount} color="error" max={99}>
                    <Icon sx={{ fontSize: 22 }} />
                  </Badge>
                ) : (
                  <Icon sx={{ fontSize: 22 }} />
                )}
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: 14 }}
                />
              )}
            </ListItemButton>
          );

          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
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

      <Divider />

      {/* User profile & logout */}
      <Box sx={{ p: collapsed ? 1 : 2, transition: TRANSITION }}>
        {!collapsed ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, px: 1 }}>
              <Avatar sx={{ width: 40, height: 40, mr: 1.5 }}>
                {user?.name?.charAt(0) || 'A'}
              </Avatar>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight="medium" noWrap>
                  {user?.name || 'Admin User'}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {user?.email || 'admin@neramclasses.com'}
                </Typography>
              </Box>
            </Box>

            <ListItemButton
              onClick={handleLogout}
              sx={{
                borderRadius: 1,
                color: 'error.main',
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <LogoutIcon color="error" />
              </ListItemIcon>
              <ListItemText primary="Logout" />
            </ListItemButton>
          </>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
            <Tooltip title={user?.name || 'Admin'} placement="right" arrow>
              <Avatar sx={{ width: 36, height: 36, fontSize: 14 }}>
                {user?.name?.charAt(0) || 'A'}
              </Avatar>
            </Tooltip>
            <Tooltip title="Logout" placement="right" arrow>
              <IconButton onClick={handleLogout} size="small" color="error">
                <LogoutIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
