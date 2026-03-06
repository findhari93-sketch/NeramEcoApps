'use client';

import { useState } from 'react';
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
  Tabs,
  Tab,
  Chip,
  Divider,
} from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LogoutIcon from '@mui/icons-material/Logout';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { neramTokens } from '@neram/ui';
import { useThemeMode } from '@neram/ui';
import { useSidebar } from '@/contexts/SidebarContext';
import UserNotificationBell from '@/components/UserNotificationBell';
import Link from 'next/link';
import {
  NATA_TOOLS,
  JEE_TOOLS,
  SIDEBAR_BOTTOM_NAV,
  type ToolNavItem,
  type GeneralNavItem,
} from '@/lib/navigation-data';

const TRANSITION = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

interface AppSidebarProps {
  userName: string;
  userAvatar?: string | null;
  phoneVerified: boolean;
  onSignOut: () => void;
  onItemClick?: () => void;
}

export default function AppSidebar({
  userName,
  userAvatar,
  phoneVerified,
  onSignOut,
  onItemClick,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleSidebar } = useSidebar();
  const { mode, toggleMode } = useThemeMode();
  const [examTab, setExamTab] = useState(() => {
    if (pathname.startsWith('/tools/jee')) return 1;
    return 0;
  });

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  const tools = examTab === 0 ? NATA_TOOLS : JEE_TOOLS;

  const renderNavItem = (item: ToolNavItem | GeneralNavItem, indent = false) => {
    const active = isActive(item.href);
    const comingSoon = 'comingSoon' in item && item.comingSoon;

    const button = (
      <ListItemButton
        component={comingSoon ? 'div' : Link}
        href={comingSoon ? undefined : item.href}
        onClick={comingSoon ? undefined : onItemClick}
        sx={{
          borderRadius: 1,
          justifyContent: collapsed ? 'center' : 'flex-start',
          px: collapsed ? 0.75 : indent ? 1.5 : 1,
          py: 0.5,
          minHeight: 36,
          cursor: comingSoon ? 'default' : 'pointer',
          transition: TRANSITION,
          borderLeft: active ? '3px solid' : '3px solid transparent',
          borderColor: active ? 'primary.main' : 'transparent',
          bgcolor: active ? 'action.selected' : 'transparent',
          opacity: comingSoon ? 0.5 : 1,
          '&:hover': {
            bgcolor: comingSoon ? 'transparent' : active ? 'action.selected' : 'action.hover',
          },
          '&.Mui-selected': {
            bgcolor: 'action.selected',
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: collapsed ? 'auto' : 28,
            justifyContent: 'center',
            color: active ? 'primary.main' : 'text.secondary',
          }}
        >
          {item.icon}
        </ListItemIcon>
        {!collapsed && (
          <>
            <ListItemText
              primary={item.title}
              primaryTypographyProps={{
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? 'text.primary' : comingSoon ? 'text.disabled' : 'text.primary',
                noWrap: true,
              }}
            />
            {comingSoon && (
              <Chip
                label="Soon"
                size="small"
                sx={{ height: 18, fontSize: '0.6rem', ml: 0.5 }}
              />
            )}
          </>
        )}
      </ListItemButton>
    );

    return (
      <ListItem key={item.href} disablePadding sx={{ display: 'block' }}>
        {collapsed ? (
          <Tooltip title={item.title} placement="right" arrow>
            {button}
          </Tooltip>
        ) : (
          button
        )}
      </ListItem>
    );
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      {/* Header — logo + bell + collapse chevron */}
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
            <Box>
              <Typography
                component={Link}
                href="/dashboard"
                sx={{
                  fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'text.primary',
                  textDecoration: 'none',
                  lineHeight: 1,
                }}
              >
                ai
                <Box component="span" sx={{ color: neramTokens.gold[500] }}>
                  Architek
                </Box>
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.55rem',
                  color: 'text.secondary',
                  lineHeight: 1.2,
                  mt: 0.25,
                  letterSpacing: '0.02em',
                }}
              >
                From Cutoffs to Colleges
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              {phoneVerified && <UserNotificationBell />}
              <IconButton onClick={toggleSidebar} size="small" sx={{ width: 22, height: 22 }}>
                <ChevronLeftIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </>
        ) : (
          <IconButton onClick={toggleSidebar} size="small" sx={{ width: 22, height: 22 }}>
            <ChevronRightIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>

      <Divider />

      {/* Exam Tabs — hidden when collapsed */}
      {!collapsed && (
        <Tabs
          value={examTab}
          onChange={(_e, v) => setExamTab(v)}
          variant="fullWidth"
          sx={{
            minHeight: 36,
            borderBottom: '1px solid',
            borderColor: 'divider',
            '& .MuiTab-root': {
              minHeight: 36,
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'none',
              py: 0,
            },
            '& .MuiTabs-indicator': {
              height: 2,
            },
          }}
        >
          <Tab label="NATA" />
          <Tab label="JEE Paper 2" />
        </Tabs>
      )}

      {/* Tool Navigation */}
      <List sx={{ px: collapsed ? 0.25 : 0.5, py: 0.5, flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {tools.map((item) => renderNavItem(item, true))}
      </List>

      <Divider />

      {/* Bottom General Nav */}
      <List sx={{ px: collapsed ? 0.25 : 0.5, py: 0.25 }}>
        {SIDEBAR_BOTTOM_NAV.map((item) => renderNavItem(item))}
      </List>

      <Divider />

      {/* Theme Toggle */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: collapsed ? 'center' : 'flex-start',
          px: collapsed ? 0.5 : 1.5,
          py: 0.5,
          transition: TRANSITION,
        }}
      >
        <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'} placement="right" arrow>
          <IconButton onClick={toggleMode} size="small" sx={{ width: 28, height: 28, color: 'text.secondary' }}>
            {mode === 'dark' ? (
              <LightModeOutlinedIcon sx={{ fontSize: 16 }} />
            ) : (
              <DarkModeOutlinedIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      {/* User Row — compact */}
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
              <Avatar
                src={userAvatar || undefined}
                sx={{ width: 24, height: 24, fontSize: 11 }}
              >
                {userName?.charAt(0)?.toUpperCase() || 'S'}
              </Avatar>
              <Typography variant="caption" fontWeight={500} noWrap sx={{ flex: 1, minWidth: 0 }}>
                {userName || 'Student'}
              </Typography>
            </Box>
            <Tooltip title="Sign out" placement="top" arrow>
              <IconButton onClick={onSignOut} size="small" sx={{ width: 22, height: 22, color: 'text.secondary' }}>
                <LogoutIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Tooltip title={`${userName || 'Student'} — Sign out`} placement="right" arrow>
            <IconButton onClick={onSignOut} size="small" sx={{ width: 28, height: 28 }}>
              <Avatar
                src={userAvatar || undefined}
                sx={{ width: 24, height: 24, fontSize: 11 }}
              >
                {userName?.charAt(0)?.toUpperCase() || 'S'}
              </Avatar>
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
