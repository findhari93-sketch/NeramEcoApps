'use client';

import { useMemo } from 'react';
import katex from 'katex';
import { Box, Typography } from '@neram/ui';

interface MathTextProps {
  /** Text containing LaTeX delimiters: $...$ (inline) or $$...$$ (block) */
  text: string;
  variant?: 'body1' | 'body2' | 'subtitle1' | 'subtitle2' | 'caption' | 'h6' | 'h5' | 'h4';
  component?: React.ElementType;
  sx?: Record<string, unknown>;
  color?: string;
}

interface Segment {
  type: 'text' | 'math';
  content: string;
  displayMode: boolean;
}

/**
 * Parse text into segments of plain text and math (LaTeX).
 * Supports $$...$$ (block/display) and $...$ (inline) delimiters.
 * Escaped dollars (\$) are treated as literal $ signs.
 */
function parseSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  // Replace escaped dollars with a placeholder
  const PLACEHOLDER = '\u0000DOLLAR\u0000';
  const text = input.replace(/\\\$/g, PLACEHOLDER);

  let remaining = text;

  while (remaining.length > 0) {
    // Look for the next $$ or $
    const blockStart = remaining.indexOf('$$');
    const inlineStart = remaining.indexOf('$');

    // No more math delimiters
    if (inlineStart === -1) {
      segments.push({ type: 'text', content: remaining, displayMode: false });
      break;
    }

    // Check if block math comes first (or at same position as inline)
    if (blockStart !== -1 && blockStart <= inlineStart) {
      // Add text before $$
      if (blockStart > 0) {
        segments.push({ type: 'text', content: remaining.slice(0, blockStart), displayMode: false });
      }
      // Find closing $$
      const closeIdx = remaining.indexOf('$$', blockStart + 2);
      if (closeIdx === -1) {
        // No closing $$, treat rest as text
        segments.push({ type: 'text', content: remaining.slice(blockStart), displayMode: false });
        break;
      }
      const latex = remaining.slice(blockStart + 2, closeIdx);
      if (latex.length > 0) {
        segments.push({ type: 'math', content: latex, displayMode: true });
      }
      remaining = remaining.slice(closeIdx + 2);
    } else {
      // Inline math $...$
      if (inlineStart > 0) {
        segments.push({ type: 'text', content: remaining.slice(0, inlineStart), displayMode: false });
      }
      const closeIdx = remaining.indexOf('$', inlineStart + 1);
      if (closeIdx === -1) {
        // No closing $, treat rest as text
        segments.push({ type: 'text', content: remaining.slice(inlineStart), displayMode: false });
        break;
      }
      const latex = remaining.slice(inlineStart + 1, closeIdx);
      if (latex.length > 0) {
        segments.push({ type: 'math', content: latex, displayMode: false });
      }
      remaining = remaining.slice(closeIdx + 1);
    }
  }

  // Restore escaped dollars
  return segments.map((seg) => ({
    ...seg,
    content: seg.content.replaceAll(PLACEHOLDER, '$'),
  }));
}

function renderMath(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode,
      strict: false,
      trust: true,
      output: 'html',
    });
  } catch {
    // Fallback: show raw LaTeX in red
    return `<span style="color: #d32f2f; font-family: monospace;">${latex}</span>`;
  }
}

/**
 * Renders text with inline ($...$) and block ($$...$$) LaTeX math formulas.
 * Falls back gracefully on malformed LaTeX.
 */
export default function MathText({ text, variant, component, sx, color }: MathTextProps) {
  const segments = useMemo(() => parseSegments(text), [text]);

  // Fast path: no math detected, render plain text
  const hasMath = segments.some((s) => s.type === 'math');
  const mergedSx = { whiteSpace: 'pre-wrap' as const, ...sx };

  if (!hasMath) {
    return (
      <Typography variant={variant} color={color} sx={mergedSx} {...(component ? { component } : {})}>
        {text}
      </Typography>
    );
  }

  return (
    <Typography
      variant={variant}
      component={component ?? ('div' as React.ElementType)}
      color={color}
      sx={mergedSx}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <span key={i}>{seg.content}</span>;
        }
        // Math segment
        const html = renderMath(seg.content, seg.displayMode);
        if (seg.displayMode) {
          return (
            <Box
              key={i}
              component="span"
              sx={{ display: 'block', textAlign: 'center', my: 1 }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        return (
          <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        );
      })}
    </Typography>
  );
}
