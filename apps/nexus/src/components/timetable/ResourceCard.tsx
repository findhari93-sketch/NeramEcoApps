'use client';

/**
 * One piece of reference material, as a row.
 *
 * Shared by the teacher's editor and every student surface. `editable` controls
 * only whether the overflow menu is rendered, which is what stops the two views
 * from drifting into different-looking lists of the same thing.
 *
 * Built on the filled-row idiom from ClassAssignmentsSection so a class panel
 * reads as one panel: same border, same radius, same 26px tinted glyph.
 */

import { useState } from 'react';
import {
  Box,
  Button,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import LinkIcon from '@mui/icons-material/Link';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { RADIUS } from './timetable-theme';
import { displayHost, type ClassResource } from '@/lib/class-resources';
import type { NexusClassResourceKind } from '@neram/database';

const GLYPH: Record<NexusClassResourceKind, typeof LinkIcon> = {
  youtube: PlayCircleOutlineIcon,
  link: LinkIcon,
  image: ImageOutlinedIcon,
  study_file: PictureAsPdfOutlinedIcon,
};

/** What the second line says when there is no teacher note. */
function subtitleFor(resource: ClassResource): string {
  switch (resource.kind) {
    case 'youtube':
      return 'Video';
    case 'image':
      return 'Image';
    case 'study_file':
      return 'PDF, opens in the reader';
    default:
      return displayHost(resource.url) || 'Link';
  }
}

interface ResourceCardProps {
  resource: ClassResource;
  onOpen: (resource: ClassResource) => void;
  /** Teacher mode: renders the overflow menu. */
  editable?: boolean;
  busy?: boolean;
  onRename?: (resource: ClassResource) => void;
  onEditNote?: (resource: ClassResource) => void;
  onMove?: (resource: ClassResource, direction: -1 | 1) => void;
  onRemove?: (resource: ClassResource) => void;
  /** Disables Move up / Move down at the ends of the list. */
  isFirst?: boolean;
  isLast?: boolean;
}

export default function ResourceCard({
  resource,
  onOpen,
  editable = false,
  busy = false,
  onRename,
  onEditNote,
  onMove,
  onRemove,
  isFirst,
  isLast,
}: ResourceCardProps) {
  const theme = useTheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const Glyph = GLYPH[resource.kind] || LinkIcon;
  const hasThumb = Boolean(resource.thumb_url);

  const closeMenu = () => setAnchor(null);
  const run = (fn?: (r: ClassResource) => void) => () => {
    closeMenu();
    fn?.(resource);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.125,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: RADIUS.control,
        p: 1.375,
      }}
    >
      {/* The whole left side is the open target, so a thumbnail and its title
          are one tap rather than two competing ones. */}
      <Box
        role="button"
        tabIndex={0}
        onClick={() => onOpen(resource)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(resource);
          }
        }}
        aria-label={`Open ${resource.title}`}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.125,
          flex: 1,
          minWidth: 0,
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: RADIUS.control,
          '&:focus-visible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        }}
      >
        {hasThumb ? (
          <Box
            component="img"
            src={resource.thumb_url as string}
            alt=""
            loading="lazy"
            sx={{
              width: 64,
              height: 40,
              flexShrink: 0,
              borderRadius: 1,
              objectFit: 'cover',
              bgcolor: alpha(theme.palette.text.primary, 0.05),
            }}
          />
        ) : (
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: 1,
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: 'primary.dark',
            }}
          >
            <Glyph sx={{ fontSize: 15 }} />
          </Box>
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.7813rem', lineHeight: 1.3 }} noWrap>
            {resource.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {subtitleFor(resource)}
          </Typography>
          {/* The teacher's reason for sharing. Not truncated to one line: it is
              the part that tells a student what to actually look for. */}
          {resource.note && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.5, color: 'text.primary', lineHeight: 1.5 }}
            >
              {resource.note}
            </Typography>
          )}
        </Box>
      </Box>

      {editable && (
        <>
          <Button
            size="small"
            onClick={(e) => setAnchor(e.currentTarget)}
            disabled={busy}
            aria-label={`Options for ${resource.title}`}
            sx={{ minWidth: 44, minHeight: 44, p: 0, color: 'text.disabled', flexShrink: 0 }}
          >
            <MoreVertIcon fontSize="small" />
          </Button>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu}>
            <MenuItem onClick={run(onRename)} sx={{ minHeight: 44 }}>
              <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Rename</ListItemText>
            </MenuItem>
            <MenuItem onClick={run(onEditNote)} sx={{ minHeight: 44 }}>
              <ListItemIcon><NotesOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{resource.note ? 'Edit note' : 'Add a note'}</ListItemText>
            </MenuItem>
            {/* Move up / down rather than drag and drop: a drag handle is
                unreliable at 375px, and this keeps every action a 44px target. */}
            <MenuItem
              onClick={() => { closeMenu(); onMove?.(resource, -1); }}
              disabled={isFirst}
              sx={{ minHeight: 44 }}
            >
              <ListItemIcon><ArrowUpwardIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Move up</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => { closeMenu(); onMove?.(resource, 1); }}
              disabled={isLast}
              sx={{ minHeight: 44 }}
            >
              <ListItemIcon><ArrowDownwardIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Move down</ListItemText>
            </MenuItem>
            <MenuItem onClick={run(onRemove)} sx={{ minHeight: 44, color: 'error.main' }}>
              <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
              <ListItemText>Remove</ListItemText>
            </MenuItem>
          </Menu>
        </>
      )}
    </Box>
  );
}
