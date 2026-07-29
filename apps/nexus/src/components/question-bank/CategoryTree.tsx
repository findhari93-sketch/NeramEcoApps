'use client';

import { useState, useCallback, useMemo } from 'react';
import { Box, Checkbox, Typography, Collapse, IconButton } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { NexusQBTagNode } from '@neram/database';
import { nodeSelectionState, toggleCategoryNode, flattenTagTree } from '@/lib/qb-category-tree';

interface CategoryTreeProps {
  tree: NexusQBTagNode[];
  /** Collapsed selection: may contain parent slugs. See lib/qb-category-tree. */
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Two-level Category picker for the question bank filter drawer.
 *
 * Checkboxes rather than chips because a partial parent selection needs an
 * honest third state: a Chip is only filled or outlined, so "3 of 8 children"
 * has no representation, while Checkbox has `indeterminate` natively.
 *
 * A parent renders when its rollup count is above zero and a child when its own
 * count is. That is what lets this ship before reclassification: Parabola,
 * Ellipse, Hyperbola, Locus and Areas of Triangles simply do not appear until
 * questions are actually tagged with them, then appear with no deploy.
 */
function CategoryTreeNode({
  node,
  depth,
  selected,
  tree,
  onToggle,
}: {
  node: NexusQBTagNode;
  depth: number;
  selected: string[];
  tree: NexusQBTagNode[];
  onToggle: (node: NexusQBTagNode, checked: boolean) => void;
}) {
  const visibleChildren = useMemo(
    () => (node.children || []).filter((c) => c.self_count > 0 || c.rollup_count > 0),
    [node.children],
  );
  const hasChildren = visibleChildren.length > 0;

  // Passing the tree lets a child inherit "checked" from a collapsed ancestor.
  const state = nodeSelectionState(node, selected, tree);
  const isChecked = state === 'checked';
  const isIndeterminate = state === 'indeterminate';

  // Open on mount when something inside this branch is already filtered, so a
  // returning student can see where their selection lives.
  const [expanded, setExpanded] = useState(() => isIndeterminate);

  const handleToggle = useCallback(() => {
    onToggle(node, !isChecked);
  }, [node, isChecked, onToggle]);

  const handleExpandToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  // Collapsed preview so a parent is not an opaque box: "Straight Lines, Circles, +6 more"
  const previewText = useMemo(() => {
    if (!hasChildren || expanded) return null;
    const names = visibleChildren.slice(0, 2).map((c) => c.label);
    const rest = visibleChildren.length - names.length;
    return names.join(', ') + (rest > 0 ? `, +${rest} more` : '');
  }, [hasChildren, expanded, visibleChildren]);

  const count = hasChildren ? node.rollup_count : node.self_count;

  return (
    <Box>
      <Box
        data-testid={`cat-row-${node.slug}`}
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 48,
          // Depth capped at one level of indent: at 375px the expander slot and
          // checkbox already eat ~62px and long labels must still fit.
          pl: `${Math.min(depth, 1) * 12}px`,
          cursor: 'pointer',
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={handleToggle}
      >
        {hasChildren ? (
          <IconButton
            onClick={handleExpandToggle}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
            aria-expanded={expanded}
            data-testid={`cat-expand-${node.slug}`}
            sx={{ width: 44, height: 44, flexShrink: 0 }}
          >
            {expanded ? <ExpandMoreIcon sx={{ fontSize: 20 }} /> : <ChevronRightIcon sx={{ fontSize: 20 }} />}
          </IconButton>
        ) : (
          <Box sx={{ width: 44, flexShrink: 0 }} />
        )}

        <Checkbox
          size="small"
          checked={isChecked}
          indeterminate={isIndeterminate}
          onChange={handleToggle}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          inputProps={
            { 'aria-label': node.label, 'data-testid': `cat-cb-${node.slug}` } as React.InputHTMLAttributes<HTMLInputElement>
          }
          sx={{ p: 0.5, flexShrink: 0 }}
        />

        {/* Labels wrap, never truncate. "Permutations & Combinations" is the
            widest and is the real source of horizontal overflow at 375px. */}
        <Typography
          variant="body2"
          sx={{
            fontSize: 13,
            ml: 0.5,
            flex: 1,
            minWidth: 0,
            fontWeight: hasChildren ? 600 : 400,
            lineHeight: 1.3,
            overflowWrap: 'anywhere',
          }}
        >
          {node.label}
        </Typography>

        {/* Count sits outside the label so it never widens the wrap box. */}
        {count > 0 && (
          <Typography
            variant="caption"
            sx={{ fontSize: 11, color: 'text.secondary', mx: 1, flexShrink: 0 }}
          >
            {count}
          </Typography>
        )}
      </Box>

      {hasChildren && !expanded && previewText && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            pl: `${Math.min(depth, 1) * 12 + 56}px`,
            pr: 1,
            pb: 0.5,
            fontSize: 11,
            color: 'text.disabled',
            fontStyle: 'italic',
            lineHeight: 1.3,
            overflowWrap: 'anywhere',
          }}
        >
          {previewText}
        </Typography>
      )}

      {hasChildren && (
        <Collapse in={expanded} unmountOnExit>
          {visibleChildren.map((child) => (
            <CategoryTreeNode
              key={child.slug}
              node={child}
              depth={depth + 1}
              selected={selected}
              tree={tree}
              onToggle={onToggle}
            />
          ))}
        </Collapse>
      )}
    </Box>
  );
}

export default function CategoryTree({ tree, selected, onChange }: CategoryTreeProps) {
  const visibleRoots = useMemo(
    () => tree.filter((n) => n.rollup_count > 0 || n.self_count > 0),
    [tree],
  );

  const handleToggle = useCallback(
    (node: NexusQBTagNode, checked: boolean) => {
      onChange(toggleCategoryNode(node, selected, checked, tree));
    },
    [selected, tree, onChange],
  );

  if (visibleRoots.length === 0) return null;

  return (
    <Box>
      {visibleRoots.map((root) => (
        <CategoryTreeNode
          key={root.slug}
          node={root}
          depth={0}
          selected={selected}
          tree={tree}
          onToggle={handleToggle}
        />
      ))}
    </Box>
  );
}

/** Slugs the tree can render, so callers know what it does NOT cover. */
export function categoryTreeSlugs(tree: NexusQBTagNode[]): Set<string> {
  return new Set(flattenTagTree(tree).map((n) => n.slug));
}
