'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Avatar,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  alpha,
  useTheme,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

export const SIDEBAR_WIDTH = 260;

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface DesktopSidebarProps {
  items: NavItem[];
}

export default function DesktopSidebar({ items }: DesktopSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const { user, nexusRole, activeClassroom } = useNexusAuthContext();

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + '/');

  return (
    <Box
      component="nav"
      sx={{
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        width: SIDEBAR_WIDTH,
        minHeight: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: theme.zIndex.drawer,
        background: `linear-gradient(180deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 50%, ${theme.palette.primary.dark} 100%)`,
        color: '#fff',
        borderRight: 'none',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Brand */}
      <Box sx={{ px: 2.5, pt: 3, pb: 1 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: '#fff',
          }}
        >
          Nexus
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: alpha('#fff', 0.6), fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.625rem' }}
        >
          Learning Platform
        </Typography>
      </Box>

      {/* Classroom indicator */}
      {activeClassroom && (
        <Box
          sx={{
            mx: 2,
            mt: 1,
            mb: 0.5,
            px: 1.5,
            py: 1,
            borderRadius: 2,
            bgcolor: alpha('#fff', 0.1),
            backdropFilter: 'blur(4px)',
          }}
        >
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.6), fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Classroom
          </Typography>
          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600, mt: 0.25 }} noWrap>
            {activeClassroom.name}
          </Typography>
        </Box>
      )}

      <Divider sx={{ borderColor: alpha('#fff', 0.12), mx: 2, my: 1.5 }} />

      {/* Navigation */}
      <List sx={{ px: 1.5, flex: 1 }}>
        {items.map((item) => {
          const active = isActive(item.path);
          return (
            <ListItemButton
              key={item.path}
              onClick={() => router.push(item.path)}
              sx={{
                borderRadius: 2.5,
                mb: 0.5,
                px: 1.5,
                py: 1,
                minHeight: 44,
                bgcolor: active ? alpha('#fff', 0.18) : 'transparent',
                color: active ? '#fff' : alpha('#fff', 0.7),
                '&:hover': {
                  bgcolor: active ? alpha('#fff', 0.22) : alpha('#fff', 0.08),
                },
                transition: 'all 200ms cubic-bezier(0.2, 0, 0, 1)',
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 36,
                  color: 'inherit',
                  '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontWeight: active ? 600 : 500,
                  letterSpacing: active ? '0.01em' : 0,
                }}
              />
              {active && (
                <Box
                  sx={{
                    width: 4,
                    height: 20,
                    borderRadius: 2,
                    bgcolor: '#fff',
                    ml: 1,
                  }}
                />
              )}
            </ListItemButton>
          );
        })}
      </List>

      {/* User section */}
      <Divider sx={{ borderColor: alpha('#fff', 0.12), mx: 2 }} />
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: alpha('#fff', 0.2),
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: 600,
            border: `2px solid ${alpha('#fff', 0.3)}`,
          }}
        >
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600, lineHeight: 1.2 }} noWrap>
            {user?.name || 'User'}
          </Typography>
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.5), textTransform: 'capitalize', fontSize: '0.6875rem' }}>
            {nexusRole || 'member'}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
