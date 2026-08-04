'use client';

/**
 * The test library's folder tree.
 *
 * Shared by the Library tab and TestPicker so a teacher navigates the same
 * shape wherever they are. Presentational: it owns expand/collapse only, and
 * every fetch, create and rename lives with the caller.
 *
 * Selection is a folder id, or one of two pseudo-folders that are real buckets
 * rather than UI decoration: ALL_FOLDERS (search everything) and UNFILED
 * (tests with folder_id NULL, which would otherwise be invisible).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, Chip, Collapse } from '@neram/ui';
import type { SxProps, Theme } from '@neram/ui';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import MoreVertOutlinedIcon from '@mui/icons-material/MoreVertOutlined';

export const ALL_FOLDERS = '__all__';
export const UNFILED = '__unfiled__';

export interface FolderNode {
  id: string;
  name: string;
  parent_id: string | null;
  test_count: number;
  children: FolderNode[];
}

interface FolderTreeNavProps {
  tree: FolderNode[];
  unfiledCount: number;
  /** ALL_FOLDERS, UNFILED, or a folder id. */
  selected: string;
  onSelect: (id: string) => void;
  /** Omit to hide the per-folder overflow menu (pickers do not manage folders). */
  onFolderMenu?: (folder: FolderNode, anchor: HTMLElement) => void;
  /**
   * Folder ids to force open. Memoise it: a fresh array every render would keep
   * re-opening what the teacher has just collapsed. Used by the picker to reveal
   * a folder it has just created inside a collapsed parent.
   */
  expandedIds?: string[];
  /** Hidden in pickers, where "everything" is the sensible default view. */
  showAll?: boolean;
  totalCount?: number;
  sx?: SxProps<Theme>;
}

const ROW_HEIGHT = 44; // Material 3 touch target. Teachers do this on a phone.

function Row({
  label,
  count,
  depth,
  selected,
  icon,
  expandable,
  expanded,
  onToggle,
  onClick,
  onMenu,
}: {
  label: string;
  count: number;
  depth: number;
  selected: boolean;
  icon: React.ReactNode;
  expandable: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onClick: () => void;
  onMenu?: (anchor: HTMLElement) => void;
}) {
  return (
    <Box
      onClick={onClick}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={expandable ? expanded : undefined}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        minHeight: ROW_HEIGHT,
        // Indent from the caret column so nested names line up under their parent.
        pl: 0.5 + depth * 1.75,
        pr: 0.5,
        borderRadius: 1.5,
        cursor: 'pointer',
        bgcolor: selected ? 'primary.main' : 'transparent',
        color: selected ? 'primary.contrastText' : 'text.primary',
        transition: 'background-color 150ms ease',
        '&:hover': { bgcolor: selected ? 'primary.main' : 'action.hover' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
      }}
    >
      {expandable ? (
        <IconButton
          size="small"
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          sx={{ color: 'inherit', p: 0.25 }}
        >
          {expanded ? (
            <ExpandMoreOutlinedIcon sx={{ fontSize: 18 }} />
          ) : (
            <ChevronRightOutlinedIcon sx={{ fontSize: 18 }} />
          )}
        </IconButton>
      ) : (
        <Box sx={{ width: 26, flexShrink: 0 }} />
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', color: 'inherit', flexShrink: 0 }}>{icon}</Box>

      <Typography
        variant="body2"
        sx={{
          flex: 1,
          minWidth: 0,
          fontWeight: selected ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>

      {count > 0 && (
        <Chip
          label={count}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.7rem',
            bgcolor: selected ? 'rgba(255,255,255,0.25)' : 'action.selected',
            color: 'inherit',
          }}
        />
      )}

      {onMenu && (
        <IconButton
          size="small"
          aria-label={`Options for ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e.currentTarget);
          }}
          sx={{ color: 'inherit', p: 0.5 }}
        >
          <MoreVertOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      )}
    </Box>
  );
}

export default function FolderTreeNav({
  tree,
  unfiledCount,
  selected,
  onSelect,
  onFolderMenu,
  expandedIds,
  showAll = true,
  totalCount = 0,
  sx,
}: FolderTreeNavProps) {
  // Top level starts open. Anything deeper starts closed, so a big library does
  // not open as a wall of folders.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.map((f) => f.id)));

  // Every caller fetches the tree after this mounts, so the initialiser above
  // ran against an empty list and nothing opened. Apply the rule once, when the
  // roots actually arrive, and not on later refetches: re-opening a folder the
  // teacher just collapsed because they renamed something is worse than useless.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || tree.length === 0) return;
    seeded.current = true;
    setExpanded((prev) => new Set([...prev, ...tree.map((f) => f.id)]));
  }, [tree]);

  useEffect(() => {
    if (!expandedIds || expandedIds.length === 0) return;
    setExpanded((prev) => {
      const missing = expandedIds.filter((id) => !prev.has(id));
      return missing.length === 0 ? prev : new Set([...prev, ...missing]);
    });
  }, [expandedIds]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderNode = (node: FolderNode, depth: number): React.ReactNode => {
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    return (
      <Box key={node.id}>
        <Row
          label={node.name}
          count={node.test_count}
          depth={depth}
          selected={selected === node.id}
          icon={
            isOpen && hasChildren ? (
              <FolderOpenOutlinedIcon sx={{ fontSize: 18 }} />
            ) : (
              <FolderOutlinedIcon sx={{ fontSize: 18 }} />
            )
          }
          expandable={hasChildren}
          expanded={isOpen}
          onToggle={() => toggle(node.id)}
          onClick={() => onSelect(node.id)}
          onMenu={onFolderMenu ? (anchor) => onFolderMenu(node, anchor) : undefined}
        />
        {hasChildren && (
          <Collapse in={isOpen} unmountOnExit>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </Collapse>
        )}
      </Box>
    );
  };

  return (
    <Box role="tree" aria-label="Test folders" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, ...sx }}>
      {showAll && (
        <Row
          label="All tests"
          count={totalCount}
          depth={0}
          selected={selected === ALL_FOLDERS}
          icon={<LibraryBooksOutlinedIcon sx={{ fontSize: 18 }} />}
          expandable={false}
          onClick={() => onSelect(ALL_FOLDERS)}
        />
      )}

      {tree.map((node) => renderNode(node, 0))}

      {/* Always rendered, even at zero, so "where did my unfiled test go" has an
          answer on screen rather than needing to be discovered. */}
      <Row
        label="Unfiled"
        count={unfiledCount}
        depth={0}
        selected={selected === UNFILED}
        icon={<InboxOutlinedIcon sx={{ fontSize: 18 }} />}
        expandable={false}
        onClick={() => onSelect(UNFILED)}
      />

      {tree.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
          No folders yet. Create one to group your tests by chapter.
        </Typography>
      )}
    </Box>
  );
}
