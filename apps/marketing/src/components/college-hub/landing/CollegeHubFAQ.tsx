import { Box, Container, Typography, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { JsonLd } from '@/components/seo/JsonLd';

const FAQ_ITEMS = [
  {
    q: 'What is Neram College Hub?',
    a: 'Neram College Hub is a free, open platform for discovering and comparing B.Arch (Bachelor of Architecture) colleges across India. You can explore fees, NATA/JEE cutoffs, NIRF rankings, ArchIndex scores, placements, faculty, and infrastructure for each college.',
  },
  {
    q: 'How many B.Arch colleges does Neram list?',
    a: 'We currently list architecture colleges in Tamil Nadu with plans to expand across all Indian states. Our database is growing every week with verified data from COA-approved institutions.',
  },
  {
    q: 'What is the ArchIndex score?',
    a: 'ArchIndex is a proprietary 0 to 100 score developed by Neram that evaluates architecture colleges across six dimensions: Studio Quality (25%), Faculty Strength (20%), Placements (20%), Infrastructure (15%), Student Satisfaction (10%), and Alumni Network (10%). It provides a holistic quality metric beyond traditional rankings.',
  },
  {
    q: 'Is the college data on Neram verified?',
    a: 'We source data from official COA records, NIRF reports, TNEA/JoSAA counseling data, and direct submissions from colleges. Gold and Platinum tier colleges undergo additional verification with a "Verified" badge displayed on their profile.',
  },
  {
    q: 'How can I compare colleges?',
    a: 'Click the Compare button on any college card to add it to your comparison tray (up to 3 colleges). The comparison page shows a detailed side-by-side view of fees, rankings, accreditations, seats, and more.',
  },
  {
    q: 'Is Neram College Hub free to use?',
    a: 'Yes, Neram College Hub is completely free for students. You can browse, compare, save colleges, and access all publicly available data at no cost. Some premium features like AI chat and virtual tours are available on select college profiles.',
  },
  {
    q: 'How can my college get listed on Neram?',
    a: 'Any COA-approved architecture college in India can get listed. Contact us through the "Claim Your College Profile" section or reach out via our contact page. Colleges can claim their profile, update data, and access analytics through the Neram College Dashboard.',
  },
];

function generateFAQSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

export default function CollegeHubFAQ() {
  return (
    <Box sx={{ py: { xs: 5, sm: 6, md: 8 }, bgcolor: '#f8fafc' }}>
      <JsonLd data={generateFAQSchema()} />
      <Container maxWidth="md">
        <Typography
          variant="h2"
          sx={{
            fontSize: { xs: '1.35rem', sm: '1.5rem' },
            fontWeight: 800,
            color: '#0f172a',
            textAlign: 'center',
            mb: { xs: 3, sm: 4 },
          }}
        >
          Frequently Asked Questions
        </Typography>

        <Box>
          {FAQ_ITEMS.map((item, i) => (
            <Accordion
              key={i}
              disableGutters
              elevation={0}
              sx={{
                bgcolor: 'transparent',
                '&:before': { display: 'none' },
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 0,
                  py: 0.5,
                  '& .MuiAccordionSummary-content': { my: 1.5 },
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>
                  {item.q}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pb: 2.5 }}>
                <Typography variant="body2" sx={{ color: '#475569', lineHeight: 1.7 }}>
                  {item.a}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
