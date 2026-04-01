'use client';

import { useState, useCallback, useMemo } from 'react';
import { Box, Checkbox, Typography, Collapse, IconButton } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { NexusQBTopic } from '@neram/database';

interface SubjectTreeProps {
  topics: NexusQBTopic[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  topicCounts?: Map<string, number>;
}

/** Collect all descendant IDs (inclusive) from a topic node. */
function collectAllIds(topic: NexusQBTopic): string[] {
  const ids = [topic.id];
  if (topic.children) {
    for (const child of topic.children) {
      ids.push(...collectAllIds(child));
    }
  }
  return ids;
}

/** Get direct children IDs of a topic. */
function getChildIds(topic: NexusQBTopic): string[] {
  return topic.children?.map((c) => c.id) ?? [];
}

function SubjectTreeNode({
  topic,
  depth,
  selectedSet,
  onToggle,
  topicCounts,
}: {
  topic: NexusQBTopic;
  depth: number;
  selectedSet: Set<string>;
  onToggle: (topic: NexusQBTopic, checked: boolean) => void;
  topicCounts?: Map<string, number>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = !!(topic.children && topic.children.length > 0);

  const allDescendantIds = useMemo(() => collectAllIds(topic), [topic]);
  const childIds = useMemo(() => getChildIds(topic), [topic]);

  // Determine checkbox state
  const selfSelected = selectedSet.has(topic.id);
  const allChildrenSelected =
    hasChildren && childIds.length > 0 && childIds.every((id) => selectedSet.has(id));
  const someChildrenSelected =
    hasChildren && childIds.length > 0 && childIds.some((id) => selectedSet.has(id));

  const isChecked = hasChildren ? allChildrenSelected && selfSelected : selfSelected;
  const isIndeterminate = hasChildren && !isChecked && (someChildrenSelected || selfSelected);

  const count = topicCounts?.get(topic.id);

  const handleCheckboxChange = useCallback(() => {
    onToggle(topic, !isChecked);
  }, [topic, isChecked, onToggle]);

  const handleExpandToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded((prev) => !prev);
    },
    [],
  );

  // Preview text: show first few child names when collapsed
  const previewText = useMemo(() => {
    if (!hasChildren || expanded) return null;
    const names = topic.children!.slice(0, 3).map((c) => c.name);
    const suffix = topic.children!.length > 3 ? `, +${topic.children!.length - 3} more` : '';
    return names.join(', ') + suffix;
  }, [hasChildren, expanded, topic.children]);

  return (
    <Box>
      {/* Row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 48,
          pl: `${depth * 8}px`,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 1,
        }}
        onClick={handleCheckboxChange}
      >
        {/* Expand/Collapse icon */}
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={handleExpandToggle}
            sx={{ mr: 0.5, p: 0.5 }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ExpandMoreIcon sx={{ fontSize: 18 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 28, flexShrink: 0 }} />
        )}

        {/* Checkbox */}
        <Checkbox
          size="small"
          checked={isChecked}
          indeterminate={isIndeterminate}
          onChange={handleCheckboxChange}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          sx={{ p: 0.5 }}
        />

        {/* Topic name */}
        <Typography
          variant="body2"
          sx={{
            fontSize: 13,
            ml: 0.5,
            flex: 1,
            fontWeight: hasChildren ? 600 : 400,
            lineHeight: 1.4,
          }}
        >
          {topic.name}
        </Typography>

        {/* Question count */}
        {count !== undefined && count > 0 && (
          <Typography
            variant="caption"
            sx={{
              fontSize: 11,
              color: 'text.secondary',
              mr: 1,
              flexShrink: 0,
            }}
          >
            {count}
          </Typography>
        )}
      </Box>

      {/* Collapsed preview */}
      {hasChildren && !expanded && previewText && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            pl: `${depth * 8 + 56}px`,
            pb: 0.5,
            fontSize: 11,
            color: 'text.disabled',
            fontStyle: 'italic',
            lineHeight: 1.3,
          }}
        >
          {previewText}
        </Typography>
      )}

      {/* Children */}
      {hasChildren && (
        <Collapse in={expanded} unmountOnExit>
          {topic.children!.map((child) => (
            <SubjectTreeNode
              key={child.id}
              topic={child}
              depth={depth + 1}
              selectedSet={selectedSet}
              onToggle={onToggle}
              topicCounts={topicCounts}
            />
          ))}
        </Collapse>
      )}
    </Box>
  );
}

export default function SubjectTree({
  topics,
  selectedIds,
  onSelectionChange,
  topicCounts,
}: SubjectTreeProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleToggle = useCallback(
    (topic: NexusQBTopic, checked: boolean) => {
      const affectedIds = collectAllIds(topic);
      let next: string[];

      if (checked) {
        // Add all descendant IDs (deduplicated via Set)
        const merged = new Set(selectedIds);
        for (const id of affectedIds) {
          merged.add(id);
        }
        next = Array.from(merged);
      } else {
        // Remove all descendant IDs
        const toRemove = new Set(affectedIds);
        next = selectedIds.filter((id) => !toRemove.has(id));
      }

      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  return (
    <Box>
      {topics.map((topic) => (
        <SubjectTreeNode
          key={topic.id}
          topic={topic}
          depth={0}
          selectedSet={selectedSet}
          onToggle={handleToggle}
          topicCounts={topicCounts}
        />
      ))}
    </Box>
  );
}
