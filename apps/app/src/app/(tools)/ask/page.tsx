import type { Metadata } from 'next';
import { Box, Typography } from '@neram/ui';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AskChat from '@/components/ask/AskChat';
import { ASK_STARTERS } from '@/lib/ask/starters';
import { JsonLd } from '@/components/seo/JsonLd';
import { faqSchema, webApplicationSchema } from '@/lib/seo/tool-schemas';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';

// The shell is the same for everyone; the chat itself runs in the browser.
export const revalidate = 86400;

const TITLE = 'Ask aiArchitek: NATA Cutoff and B.Arch College Chat';
const DESCRIPTION =
  'Ask about your NATA cutoff, B.Arch colleges, ranks and exam centres. Answers come from official TNEA, KEAM and JoSAA allotment lists, not guesses. Free.';

export function generateMetadata(): Metadata {
  return toolPageMetadata({
    title: TITLE,
    description: DESCRIPTION,
    path: '/ask',
    keywords: ['NATA cutoff chat', 'B.Arch college predictor chat', 'NATA AI assistant', 'which B.Arch college can I get', 'TNEA B.Arch cutoff', 'aiArchitek'],
  });
}

/** Why a student should ask here and not in a general chatbot. Also the FAQ answer below. */
const WHY = [
  {
    title: 'Real allotment data',
    body: 'College answers come from the official TNEA, KEAM and JoSAA allotment lists, with the year shown. A general chatbot guesses cutoffs.',
  },
  {
    title: 'The right maths for your board',
    body: 'Each board’s real maximum marks (CBSE 500, Tamil Nadu 600, Maharashtra 650) and the best of your NATA attempts.',
  },
  {
    title: 'It remembers you',
    body: 'Your marks, community and city carry from one question to the next, and you can see and edit them any time.',
  },
  {
    title: 'One tap to the full tool',
    body: 'Every answer opens the matching calculator or predictor with your values already filled in.',
  },
];

const FAQS = [
  {
    question: 'How is Ask aiArchitek different from ChatGPT or Gemini?',
    answer: WHY.map((w) => `${w.title}: ${w.body}`).join(' '),
  },
  {
    question: 'Is Ask aiArchitek free?',
    answer: 'Yes. You get three answers a day without signing in, and unlimited answers with a free account.',
  },
  {
    question: 'Can it tell me which B.Arch college I will get?',
    answer:
      'It shows the colleges that students with your cutoff or rank got last year, grouped as safe, target and reach, from the official allotment lists. Seats change every year, so treat it as a strong guide, not a promise.',
  },
];

function Intro() {
  return (
    <Box component="section" aria-labelledby="ask-title" sx={{ pt: { xs: 1, md: 3 }, pb: 2 }}>
      <Box
        aria-hidden="true"
        sx={{ width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: 'action.hover', mb: 2 }}
      >
        <AutoAwesomeRoundedIcon />
      </Box>
      <Typography id="ask-title" component="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.625rem', md: '2rem' }, lineHeight: 1.2 }}>
        Ask about your NATA score, cutoff or colleges
      </Typography>
      <Typography sx={{ mt: 1, color: 'text.secondary', fontSize: '1rem', lineHeight: 1.6, maxWidth: 600 }}>
        Type your marks the way you would tell a friend. Ask aiArchitek works out your cutoff out of 400 and shows the colleges students with
        your score got last year, from the official allotment lists.
      </Typography>

      <Typography component="h2" sx={{ mt: 3, mb: 1, fontWeight: 700, fontSize: '0.875rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Try asking
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        {ASK_STARTERS.map((q) => (
          <Box component="li" key={q}>
            <Box
              component="a"
              href={`/ask?q=${encodeURIComponent(q)}`}
              data-ask-starter={q}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 56,
                height: '100%',
                px: 2,
                py: 1.25,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                color: 'text.primary',
                textDecoration: 'none',
                fontSize: '0.9375rem',
                lineHeight: 1.4,
                transition: 'border-color 150ms ease',
                '&:hover': { borderColor: 'primary.main' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Box component="span" sx={{ flex: 1 }}>
                {q}
              </Box>
              <ArrowForwardRoundedIcon aria-hidden="true" sx={{ fontSize: 18, color: 'text.secondary' }} />
            </Box>
          </Box>
        ))}
      </Box>

      <Typography component="h2" sx={{ mt: 4, mb: 1.5, fontWeight: 700, fontSize: '1.125rem' }}>
        Why ask here and not a general chatbot
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        {WHY.map((w) => (
          <Box component="li" key={w.title} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
            <CheckCircleOutlineRoundedIcon aria-hidden="true" sx={{ color: 'success.main', mt: '2px' }} />
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{w.title}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.55 }}>
                {w.body}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function AskPage() {
  return (
    <>
      <JsonLd
        data={[
          webApplicationSchema({
            name: 'Ask aiArchitek',
            description: DESCRIPTION,
            path: '/ask',
            features: [
              'NATA cutoff out of 400 for every board',
              'TNEA, KEAM and JoSAA B.Arch college matches from official allotments',
              'Rank estimate from the official rank list',
              'Nearest NATA test cities',
              'COA approval check',
            ],
          }),
          faqSchema(FAQS.map((f) => ({ q: f.question, a: f.answer }))),
        ]}
      />
      <AskChat intro={<Intro />} />
    </>
  );
}
