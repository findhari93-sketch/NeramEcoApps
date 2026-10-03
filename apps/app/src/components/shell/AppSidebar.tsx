'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Box, Typography, Tooltip, IconButton, Chip, Divider } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import type { SvgIconComponent } from '@mui/icons-material';
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import KeyboardDoubleArrowRightRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowRightRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { useThemeMode } from '@neram/ui';
import { useSidebar } from '@/contexts/SidebarContext';
import UserNotificationBell from '@/components/UserNotificationBell';
import AvatarWithRing from '@/components/AvatarWithRing';
import BrandMark from './BrandMark';
import {
  PRIMARY_NAV,
  ACCOUNT_NAV,
  TOOL_TRACKS,
  toolsForTrack,
  trackFromPath,
  isNavActive,
  type ToolTrack,
} from '@/lib/navigation-data';
import type { AccountTier } from '@neram/database';

interface AppSidebarProps {
  userName: string;
  userAvatar?: string | null;
  phoneVerified: boolean;
  onSignOut: () => void;
  onItemClick?: () => void;
  forceExpanded?: boolean;
  accountTier: AccountTier;
}

export default function AppSidebar({
  userName,
  userAvatar,
  phoneVerified,
  onSignOut,
  onItemClick,
  forceExpanded,
  accountTier,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { collapsed: contextCollapsed, toggleSidebar } = useSidebar();
  const collapsed = forceExpanded ? false : contextCollapsed;
  const { mode, toggleMode } = useThemeMode();

  // Follow the route: opening a Counseling tool from anywhere shows the
  // Counseling list. The student can still browse another track by hand.
  const routeTrack = trackFromPath(pathname);
  const [track, setTrack] = useState<ToolTrack>(routeTrack ?? 'nata');
  useEffect(() => {
    if (routeTrack) setTrack(routeTrack);
  }, [routeTrack]);

  const tools = toolsForTrack(track);
  const displayName = userName || 'Student';

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
      {/* Brand */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 1,
          px: collapsed ? 1 : 2,
          minHeight: 64,
        }}
      >
        <Box
          component={Link}
          href="/dashboard"
          onClick={onItemClick}
          aria-label="aiArchitek home"
          sx={{ display: 'flex', alignItems: 'center', minHeight: 44, borderRadius: 2, minWidth: 0 }}
        >
          <BrandMark tagline={!collapsed} iconOnly={collapsed} />
        </Box>
        {!collapsed && phoneVerified && !forceExpanded && <UserNotificationBell />}
      </Box>

      <Divider />

      <Box
        component="nav"
        aria-label="App"
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: collapsed ? 1 : 1.5,
          py: 1.5,
          scrollbarWidth: 'thin',
        }}
      >
        <NavList>
          {PRIMARY_NAV.map((item) => (
            <NavRow
              key={item.href}
              href={item.href}
              label={item.title}
              Icon={item.Icon}
              active={isNavActive(pathname, item.href)}
              collapsed={collapsed}
              onClick={onItemClick}
            />
          ))}
        </NavList>

        {/* Exam track */}
        <Box sx={{ mt: 2.5, mb: 1 }}>
          {!collapsed && <SectionLabel id="sidebar-track-label">Tools for</SectionLabel>}
          <Box
            role="group"
            aria-labelledby={collapsed ? undefined : 'sidebar-track-label'}
            aria-label={collapsed ? 'Tools for' : undefined}
            sx={{
              display: 'flex',
              flexDirection: collapsed ? 'column' : 'row',
              gap: 0.5,
              p: 0.5,
              borderRadius: 2.5,
              bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'light' ? 0.05 : 0.08),
            }}
          >
            {TOOL_TRACKS.map(({ id, label, shortLabel, Icon }) => {
              const selected = track === id;
              const button = (
                <Box
                  key={id}
                  component="button"
                  type="button"
                  aria-pressed={selected}
                  aria-label={collapsed ? label : undefined}
                  onClick={() => setTrack(id)}
                  sx={{
                    // Size to the label so "Counseling" never spills out of its pill
                    flex: collapsed ? 1 : '1 1 auto',
                    minHeight: collapsed ? 44 : 36,
                    minWidth: 0,
                    px: 1,
                    border: 0,
                    borderRadius: 2,
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: selected ? 'text.primary' : 'text.secondary',
                    bgcolor: selected ? 'background.paper' : 'transparent',
                    boxShadow: selected ? '0 1px 2px rgba(6,13,31,0.12), 0 0 0 1px rgba(6,13,31,0.04)' : 'none',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {collapsed ? <Icon sx={{ fontSize: 20 }} /> : shortLabel}
                </Box>
              );
              return collapsed ? (
                <Tooltip key={id} title={label} placement="right" arrow>
                  {button}
                </Tooltip>
              ) : (
                button
              );
            })}
          </Box>
        </Box>

        <NavList>
          {tools.map((tool) => (
            <NavRow
              key={tool.href}
              href={tool.href}
              label={tool.shortTitle ?? tool.title}
              Icon={tool.Icon}
              active={isNavActive(pathname, tool.href)}
              collapsed={collapsed}
              comingSoon={tool.comingSoon}
              onClick={onItemClick}
            />
          ))}
        </NavList>

        <Divider sx={{ my: 2 }} />

        {!collapsed && <SectionLabel>Your account</SectionLabel>}
        <NavList>
          {ACCOUNT_NAV.map((item) => (
            <NavRow
              key={item.href}
              href={item.href}
              label={item.title}
              Icon={item.Icon}
              active={isNavActive(pathname, item.href)}
              collapsed={collapsed}
              onClick={onItemClick}
            />
          ))}
        </NavList>
      </Box>

      {/* Footer: theme, user, collapse */}
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', px: collapsed ? 1 : 1.5, py: 1 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: collapsed ? 'column' : 'row',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          {collapsed ? (
            <Tooltip title={`Signed in as ${displayName}`} placement="right" arrow>
              <Box sx={{ display: 'flex', py: 0.5 }}>
                <AvatarWithRing src={userAvatar} name={displayName} size={32} tier={accountTier} sx={{ fontSize: 13 }} />
              </Box>
            </Tooltip>
          ) : (
            <Box
              component={Link}
              href="/profile"
              onClick={onItemClick}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                flex: 1,
                minWidth: 0,
                minHeight: 44,
                px: 0.75,
                borderRadius: 2,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <AvatarWithRing src={userAvatar} name={displayName} size={32} tier={accountTier} sx={{ fontSize: 13 }} />
              <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 600, minWidth: 0 }}>
                {displayName}
              </Typography>
            </Box>
          )}
          <FooterIconButton
            label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleMode}
            collapsed={collapsed}
          >
            {mode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
          </FooterIconButton>
          <FooterIconButton label="Sign out" onClick={onSignOut} collapsed={collapsed}>
            <LogoutRoundedIcon fontSize="small" />
          </FooterIconButton>
        </Box>
        {!forceExpanded && (
          <Box
            component="button"
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            sx={{
              mt: 0.5,
              width: '100%',
              minHeight: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 1,
              px: collapsed ? 0 : 1,
              border: 0,
              borderRadius: 2,
              bgcolor: 'transparent',
              color: 'text.secondary',
              font: 'inherit',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
            }}
          >
            {collapsed ? (
              <KeyboardDoubleArrowRightRoundedIcon fontSize="small" />
            ) : (
              <>
                <KeyboardDoubleArrowLeftRoundedIcon fontSize="small" />
                Collapse
              </>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function NavList({ children }: { children: React.ReactNode }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {children}
    </Box>
  );
}

function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Typography
      id={id}
      component="p"
      sx={{
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'text.secondary',
        px: 1,
        mb: 0.75,
      }}
    >
      {children}
    </Typography>
  );
}

interface NavRowProps {
  href: string;
  label: string;
  Icon: SvgIconComponent;
  active: boolean;
  collapsed: boolean;
  comingSoon?: boolean;
  onClick?: () => void;
}

function NavRow({ href, label, Icon, active, collapsed, comingSoon, onClick }: NavRowProps) {
  const content = (
    <>
      <Icon sx={{ fontSize: 20, flexShrink: 0, color: active ? 'primary.main' : 'inherit' }} />
      {!collapsed && (
        <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </Box>
      )}
      {!collapsed && comingSoon && (
        <Chip label="Soon" size="small" sx={{ height: 20, fontSize: '0.6875rem', '& .MuiChip-label': { px: 0.75 } }} />
      )}
    </>
  );

  const rowSx = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'flex-start',
    gap: 1.25,
    minHeight: 42,
    px: collapsed ? 0 : 1.25,
    borderRadius: 2,
    fontSize: '0.875rem',
    fontWeight: active ? 600 : 500,
    color: comingSoon ? 'text.disabled' : active ? 'text.primary' : 'text.secondary',
    bgcolor: active ? 'action.selected' : 'transparent',
    position: 'relative' as const,
    transition: 'background-color 0.15s ease, color 0.15s ease',
    ...(comingSoon
      ? { cursor: 'default' }
      : { '&:hover': { bgcolor: active ? 'action.selected' : 'action.hover', color: 'text.primary' } }),
  };

  const row = comingSoon ? (
    <Box sx={rowSx} aria-disabled="true">
      {content}
      {collapsed && <span className="visually-hidden">{label} (coming soon)</span>}
    </Box>
  ) : (
    <Box
      component={Link}
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      sx={rowSx}
    >
      {content}
    </Box>
  );

  return (
    <li>
      {collapsed ? (
        <Tooltip title={comingSoon ? `${label} (coming soon)` : label} placement="right" arrow>
          {row}
        </Tooltip>
      ) : (
        row
      )}
    </li>
  );
}

function FooterIconButton({
  label,
  onClick,
  collapsed,
  children,
}: {
  label: string;
  onClick: () => void;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={label} placement={collapsed ? 'right' : 'top'} arrow>
      <IconButton onClick={onClick} aria-label={label} sx={{ width: 40, height: 40, color: 'text.secondary' }}>
        {children}
      </IconButton>
    </Tooltip>
  );
}
