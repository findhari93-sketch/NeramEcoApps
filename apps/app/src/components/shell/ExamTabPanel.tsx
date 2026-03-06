'use client';

import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
} from '@neram/ui';
import { neramTokens } from '@neram/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ToolNavItem } from '@/lib/navigation-data';

interface ExamTabPanelProps {
  tools: ToolNavItem[];
  onItemClick?: () => void;
}

export default function ExamTabPanel({ tools, onItemClick }: ExamTabPanelProps) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <Box sx={{ flex: 1, overflowY: 'auto' }}>
      <List disablePadding sx={{ py: 0.5 }}>
        {tools.map((tool) => {
          const active = isActive(tool.href);
          return (
            <ListItem key={tool.href} disablePadding>
              <ListItemButton
                component={tool.comingSoon ? 'div' : Link}
                href={tool.comingSoon ? undefined : tool.href}
                onClick={tool.comingSoon ? undefined : onItemClick}
                sx={{
                  mx: 1,
                  my: 0.25,
                  borderRadius: '8px',
                  minHeight: 44,
                  cursor: tool.comingSoon ? 'default' : 'pointer',
                  bgcolor: active ? `${neramTokens.gold[500]}12` : 'transparent',
                  '&:hover': {
                    bgcolor: tool.comingSoon
                      ? 'transparent'
                      : active
                        ? `${neramTokens.gold[500]}18`
                        : 'action.hover',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 32,
                    color: active
                      ? neramTokens.gold[500]
                      : tool.comingSoon
                        ? 'text.disabled'
                        : 'text.secondary',
                  }}
                >
                  {tool.icon}
                </ListItemIcon>
                <ListItemText
                  primary={tool.title}
                  primaryTypographyProps={{
                    fontSize: '0.825rem',
                    fontWeight: active ? 600 : 400,
                    color: tool.comingSoon
                      ? 'text.disabled'
                      : active
                        ? neramTokens.gold[700]
                        : 'text.primary',
                  }}
                />
                {tool.comingSoon && (
                  <Chip
                    label="Soon"
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      bgcolor: 'action.hover',
                      color: 'text.disabled',
                    }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
