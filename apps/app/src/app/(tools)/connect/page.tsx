import type { Metadata } from 'next';
import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CopyField from '@/components/ask/CopyField';
import { JsonLd } from '@/components/seo/JsonLd';
import { faqSchema } from '@/lib/seo/tool-schemas';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { mcpTools } from '@/lib/mcp/server';

export const revalidate = 86400;

const MCP_URL = 'https://app.neramclasses.com/api/mcp';
const TITLE = 'Use aiArchitek in ChatGPT or Claude: NATA Connector';
const DESCRIPTION =
  'Add aiArchitek to ChatGPT, Claude or any MCP app and get NATA cutoffs and B.Arch college matches from the official allotment lists, right in your chat. Free.';

export function generateMetadata(): Metadata {
  return toolPageMetadata({
    title: TITLE,
    description: DESCRIPTION,
    path: '/connect',
    keywords: ['NATA ChatGPT', 'B.Arch college predictor ChatGPT', 'NATA MCP server', 'aiArchitek connector'],
  });
}

const STEPS = [
  {
    app: 'ChatGPT',
    steps: [
      'Open Settings, then Apps and Connectors (the names can change as ChatGPT updates).',
      'Under Advanced, turn on Developer mode if your plan needs it.',
      'Create a connector, name it aiArchitek, paste the URL above, and choose no authentication.',
      'In a chat, add aiArchitek from the tools menu and ask: "My CBSE marks are 450 out of 500 and NATA 120. Which TNEA colleges can I get?"',
    ],
  },
  {
    app: 'Claude',
    steps: [
      'Open Settings, then Connectors.',
      'Add a custom connector, name it aiArchitek and paste the URL above.',
      'Turn it on in a chat and ask about your NATA cutoff or colleges.',
    ],
  },
  {
    app: 'Other MCP apps',
    steps: ['Add a remote MCP server with the URL above (Streamable HTTP, no sign-in). It works with any client that supports remote servers.'],
  },
];

const FAQS = [
  {
    q: 'What does the aiArchitek connector do?',
    a: 'It lets ChatGPT, Claude and other assistants use the aiArchitek tools: the NATA cutoff out of 400 for every board, B.Arch colleges from the official TNEA, KEAM and JoSAA allotments, rank estimates, NATA test cities, COA approval, cost, eligibility and exam dates. Each answer includes a link to the full result on aiArchitek.',
  },
  {
    q: 'Is it free, and does it see my chats?',
    a: 'It is free. The assistant only sends the values it needs for one tool (for example your marks and NATA score), never your conversation, and the connector stores nothing that identifies you.',
  },
];

export default function ConnectPage() {
  const tools = mcpTools();
  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', py: { xs: 1, md: 3 } }}>
      <JsonLd data={faqSchema(FAQS)} />
      <Box aria-hidden="true" sx={{ width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: 'action.hover', mb: 2 }}>
        <HubOutlinedIcon />
      </Box>
      <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.625rem', md: '2rem' }, lineHeight: 1.2 }}>
        Use aiArchitek inside ChatGPT or Claude
      </Typography>
      <Typography sx={{ mt: 1, color: 'text.secondary', lineHeight: 1.6 }}>
        Already asking a chatbot about your NATA score? Add aiArchitek and it answers with real numbers from the official allotment lists,
        not guesses, and links you to the full result. Or skip the setup and use{' '}
        <Box component={Link} href="/ask" sx={{ color: 'primary.main', fontWeight: 700 }}>
          ask Aintra
        </Box>{' '}
        right here.
      </Typography>

      <Typography component="h2" sx={{ mt: 4, mb: 1, fontWeight: 700, fontSize: '1.125rem' }}>
        Connector URL
      </Typography>
      <CopyField value={MCP_URL} label="aiArchitek MCP server URL" />

      {STEPS.map((s) => (
        <Box key={s.app} component="section" aria-labelledby={`connect-${s.app}`} sx={{ mt: 4 }}>
          <Typography id={`connect-${s.app}`} component="h2" sx={{ mb: 1, fontWeight: 700, fontSize: '1.125rem' }}>
            {s.app}
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.75, lineHeight: 1.6 }}>
            {s.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </Box>
        </Box>
      ))}

      <Typography component="h2" sx={{ mt: 4, mb: 1.5, fontWeight: 700, fontSize: '1.125rem' }}>
        What it can answer
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        {tools.map((t) => (
          <Box component="li" key={t.name} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <CheckCircleOutlineRoundedIcon aria-hidden="true" sx={{ color: 'success.main', mt: '2px' }} />
            <Typography sx={{ fontWeight: 600 }}>{t.title}</Typography>
          </Box>
        ))}
      </Box>

      <Typography component="h2" sx={{ mt: 4, mb: 1, fontWeight: 700, fontSize: '1.125rem' }}>
        Questions
      </Typography>
      {FAQS.map((f) => (
        <Box key={f.q} sx={{ mb: 2 }}>
          <Typography component="h3" sx={{ fontWeight: 700 }}>
            {f.q}
          </Typography>
          <Typography sx={{ color: 'text.secondary', lineHeight: 1.6 }}>{f.a}</Typography>
        </Box>
      ))}
    </Box>
  );
}
