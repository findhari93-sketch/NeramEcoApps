'use client';

import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { TOOLS_HOME_HREF, trackLabel, type ToolDef } from '@/lib/navigation-data';

interface ToolContextBarProps {
  tool: ToolDef;
  pathname: string;
}

/**
 * Wayfinding above every tool page. On a phone it is one large Back target;
 * on a laptop it is a breadcrumb. Back always has an explicit destination:
 * the tool's own home for nested pages (a question, the new-question form),
 * otherwise the Tools hub.
 */
export default function ToolContextBar({ tool, pathname }: ToolContextBarProps) {
  const nested = pathname !== tool.href;
  const backHref = nested ? tool.href : TOOLS_HOME_HREF;
  const backLabel = nested ? tool.shortTitle ?? tool.title : 'All tools';

  return (
    <Box component="nav" aria-label="Breadcrumb" sx={{ mb: { xs: 1.5, md: 2.5 } }}>
      {/* Phone: one back target */}
      <Box
        component={Link}
        href={backHref}
        sx={{
          display: { xs: 'inline-flex', md: 'none' },
          alignItems: 'center',
          gap: 0.75,
          minHeight: 44,
          pr: 1.5,
          ml: -0.5,
          pl: 0.5,
          borderRadius: 2,
          color: 'text.secondary',
          fontSize: '0.9375rem',
          fontWeight: 600,
          '&:hover': { color: 'primary.main' },
        }}
      >
        <ArrowBackRoundedIcon sx={{ fontSize: 20 }} />
        {backLabel}
      </Box>

      {/* Laptop: breadcrumb trail */}
      <Box
        component="ol"
        sx={{
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 0.5,
          listStyle: 'none',
          m: 0,
          p: 0,
          fontSize: '0.875rem',
          color: 'text.secondary',
        }}
      >
        <Crumb href={TOOLS_HOME_HREF}>Tools</Crumb>
        <Separator />
        <li>
          <Typography component="span" sx={{ fontSize: 'inherit', color: 'inherit' }}>
            {trackLabel(tool.track)}
          </Typography>
        </li>
        <Separator />
        {nested ? (
          <>
            <Crumb href={tool.href}>{tool.title}</Crumb>
            <Separator />
            <li aria-current="page">
              <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 600, color: 'text.primary' }}>
                Details
              </Typography>
            </li>
          </>
        ) : (
          <li aria-current="page">
            <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 600, color: 'text.primary' }}>
              {tool.title}
            </Typography>
          </li>
        )}
      </Box>
    </Box>
  );
}

function Crumb({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Box
        component={Link}
        href={href}
        sx={{
          color: 'text.secondary',
          fontWeight: 500,
          borderRadius: 1,
          px: 0.5,
          py: 0.25,
          '&:hover': { color: 'primary.main', textDecoration: 'underline' },
        }}
      >
        {children}
      </Box>
    </li>
  );
}

function Separator() {
  return (
    <li aria-hidden="true" style={{ display: 'flex' }}>
      <ChevronRightRoundedIcon sx={{ fontSize: 16, opacity: 0.6 }} />
    </li>
  );
}
