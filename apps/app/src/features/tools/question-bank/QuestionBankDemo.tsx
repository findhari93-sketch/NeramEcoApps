'use client';

import { useState } from 'react';
import { Box, Chip, Typography } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import DemoGate from '@/components/tools/DemoGate';

export interface DemoQuestion {
  title: string;
  category: string;
  year: number | null;
}

/**
 * Public demo: browse question titles by topic and read one sample in full.
 * Signed in: every question with answers and discussion.
 */
export default function QuestionBankDemo({
  questions,
  labels,
  sample,
}: {
  questions: DemoQuestion[];
  labels: Record<string, string>;
  sample: { title: string; body: string } | null;
}) {
  const topics = [...new Set(questions.map((q) => q.category))];
  const [topic, setTopic] = useState<string>('all');
  const list = topic === 'all' ? questions : questions.filter((q) => q.category === topic);

  return (
    <Box>
      {sample && (
        <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover', mb: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
            Sample question
          </Typography>
          <Typography component="h3" sx={{ fontWeight: 700, mb: 1 }}>
            {sample.title}
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, overflowWrap: 'anywhere' }}>{sample.body}</Typography>
        </Box>
      )}

      {topics.length > 1 && (
        <Box role="group" aria-label="Topic" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          {['all', ...topics].map((t) => (
            <Chip
              key={t}
              label={t === 'all' ? `All (${questions.length})` : `${labels[t] ?? t} (${questions.filter((q) => q.category === t).length})`}
              clickable
              color={topic === t ? 'primary' : 'default'}
              variant={topic === t ? 'filled' : 'outlined'}
              onClick={() => setTopic(t)}
              aria-pressed={topic === t}
              sx={{ minHeight: 44, borderRadius: 2 }}
            />
          ))}
        </Box>
      )}

      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
        {list.slice(0, 8).map((q) => (
          <Box component="li" key={q.title} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <QuizOutlinedIcon aria-hidden="true" sx={{ color: 'primary.main', mt: '2px' }} />
            <Box>
              <Typography sx={{ fontWeight: 600 }}>{q.title}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {labels[q.category] ?? q.category}
                {q.year ? `, NATA ${q.year}` : ''}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      <DemoGate
        toolId="nata-question-bank"
        headline={questions.length > 0 ? `Open all ${questions.length} questions with answers` : 'Be among the first to share a question'}
        benefits={['Every question with answers', 'Discussion with other students', 'Share the questions you remember']}
        cta="Sign in free to practise"
        input={{ topic }}
      />
    </Box>
  );
}
