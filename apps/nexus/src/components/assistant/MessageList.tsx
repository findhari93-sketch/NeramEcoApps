'use client';

import { useEffect, useRef } from 'react';
import { Box, useMediaQuery } from '@neram/ui';
import type { AssistantMessage } from './AssistantProvider';
import MessageBubble from './MessageBubble';

export default function MessageList({ messages }: { messages: AssistantMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [messages, reduce]);
  return (
    <Box role="log" aria-live="polite" aria-relevant="additions" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
      {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
      <div ref={endRef} />
    </Box>
  );
}
