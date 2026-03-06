'use client';

import { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@neram/ui';
import { neramTokens } from '@neram/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserProfileCard from './UserProfileCard';
import ExamTabPanel from './ExamTabPanel';
import { NATA_TOOLS, JEE_TOOLS, SIDEBAR_BOTTOM_NAV } from '@/lib/navigation-data';

interface AppSidebarProps {
  userName: string;
  userAvatar?: string | null;
  userEmail?: string | null;
  onItemClick?: () => void;
}

export default function AppSidebar({
  userName,
  userAvatar,
  userEmail,
  onItemClick,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [examTab, setExamTab] = useState(() => {
    // Auto-select JEE tab if current path is a JEE tool
    if (pathname.startsWith('/tools/jee')) return 1;
    return 0;
  });

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
      }}
    >
      {/* User Profile */}
      <UserProfileCard
        name={userName}
        avatarUrl={userAvatar}
        email={userEmail}
      />

      {/* Exam Tabs */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tabs
          value={examTab}
          onChange={(_e, v) => setExamTab(v)}
          variant="fullWidth"
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              fontSize: '0.8rem',
              fontWeight: 600,
              textTransform: 'none',
              letterSpacing: '0.02em',
            },
            '& .Mui-selected': {
              color: `${neramTokens.gold[500]} !important`,
            },
            '& .MuiTabs-indicator': {
              bgcolor: neramTokens.gold[500],
              height: 2.5,
              borderRadius: '2px 2px 0 0',
            },
          }}
        >
          <Tab label="NATA" />
          <Tab label="JEE Paper 2" />
        </Tabs>
      </Box>

      {/* Tool List */}
      <ExamTabPanel
        tools={examTab === 0 ? NATA_TOOLS : JEE_TOOLS}
        onItemClick={onItemClick}
      />

      {/* Bottom Nav */}
      <Box sx={{ mt: 'auto' }}>
        <Divider />
        <List disablePadding sx={{ py: 0.5 }}>
          {SIDEBAR_BOTTOM_NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <ListItem key={item.href} disablePadding>
                <ListItemButton
                  component={Link}
                  href={item.href}
                  onClick={onItemClick}
                  sx={{
                    mx: 1,
                    my: 0.25,
                    borderRadius: '8px',
                    minHeight: 42,
                    bgcolor: active ? `${neramTokens.gold[500]}12` : 'transparent',
                    '&:hover': {
                      bgcolor: active ? `${neramTokens.gold[500]}18` : 'action.hover',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 32,
                      color: active ? neramTokens.gold[500] : 'text.secondary',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.title}
                    primaryTypographyProps={{
                      fontSize: '0.825rem',
                      fontWeight: active ? 600 : 400,
                      color: active ? neramTokens.gold[700] : 'text.primary',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>
    </Box>
  );
}
