'use client';

import { Box, Typography } from '@neram/ui';

interface Props {
  body: string;
  values: Record<string, string>;
}

export default function MessagePreview({ body, values }: Props) {
  const renderMessage = () => {
    const parts: (string | { key: string; filled: boolean; text: string })[] = [];
    let lastIndex = 0;
    const regex = /\{\{(\w+)\}\}/g;
    let match;

    while ((match = regex.exec(body)) !== null) {
      if (match.index > lastIndex) {
        parts.push(body.slice(lastIndex, match.index));
      }
      const key = match[1];
      const filled = Boolean(values[key]?.trim());
      parts.push({ key, filled, text: filled ? values[key].trim() : `{{${key}}}` });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < body.length) {
      parts.push(body.slice(lastIndex));
    }

    return parts.map((part, i) => {
      if (typeof part === 'string') {
        return <span key={i}>{part}</span>;
      }
      return (
        <span
          key={i}
          style={{
            backgroundColor: part.filled ? '#C8E6C9' : '#FFF3CD',
            color: part.filled ? '#2E7D32' : '#856404',
            borderRadius: 4,
            padding: '0 4px',
            fontWeight: 500,
          }}
        >
          {part.text}
        </span>
      );
    });
  };

  const renderedText = body.replace(/\{\{(\w+)\}\}/g, (match, key) => values[key]?.trim() || match);
  const charCount = renderedText.length;

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          backgroundColor: '#DCF8C6',
          borderRadius: '12px 12px 12px 0',
          p: 2,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 14,
          lineHeight: 1.6,
          fontFamily: 'inherit',
          position: 'relative',
        }}
      >
        {renderMessage()}
      </Box>
      <Typography
        variant="caption"
        color={charCount > 2000 ? 'error' : 'text.secondary'}
        sx={{ mt: 0.5, display: 'block' }}
      >
        {charCount} characters{charCount > 2000 ? ' — message may be too long' : ''}
      </Typography>
    </Box>
  );
}
