'use client';

import { Box, Container, Typography, Card } from '@neram/ui';
import Link from 'next/link';
import { spokePages } from '../data/spokePages';

/** Semantic cross-link mapping: for each slug, which related slugs to show */
const relatedMap: Record<string, string[]> = {
  'how-to-apply': ['eligibility', 'fee-structure', 'photo-signature-requirements', 'important-dates'],
  'eligibility': ['how-to-apply', 'fee-structure', 'syllabus', 'scoring-and-results'],
  'syllabus': ['exam-pattern', 'drawing-test', 'best-books', 'preparation-tips'],
  'exam-centers': ['important-dates', 'admit-card', 'dos-and-donts', 'how-to-apply'],
  'fee-structure': ['how-to-apply', 'eligibility', 'important-dates', 'exam-centers'],
  'exam-pattern': ['syllabus', 'drawing-test', 'scoring-and-results', 'preparation-tips'],
  'photo-signature-requirements': ['how-to-apply', 'admit-card', 'dos-and-donts', 'important-dates'],
  'important-dates': ['how-to-apply', 'admit-card', 'exam-centers', 'fee-structure'],
  'scoring-and-results': ['cutoff-calculator', 'exam-pattern', 'eligibility', 'preparation-tips'],
  'dos-and-donts': ['admit-card', 'exam-centers', 'photo-signature-requirements', 'drawing-test'],
  'cutoff-calculator': ['scoring-and-results', 'exam-pattern', 'eligibility', 'preparation-tips'],
  'drawing-test': ['syllabus', 'exam-pattern', 'preparation-tips', 'dos-and-donts'],
  'preparation-tips': ['drawing-test', 'syllabus', 'best-books', 'previous-year-papers'],
  'previous-year-papers': ['exam-pattern', 'syllabus', 'preparation-tips', 'drawing-test'],
  'best-books': ['syllabus', 'preparation-tips', 'previous-year-papers', 'exam-pattern'],
  'admit-card': ['dos-and-donts', 'important-dates', 'exam-centers', 'how-to-apply'],
};

interface AlsoReadSectionProps {
  currentSlug: string;
  locale: string;
}

export default function AlsoReadSection({ currentSlug, locale }: AlsoReadSectionProps) {
  const relatedSlugs = relatedMap[currentSlug] || [];
  const relatedPages = relatedSlugs
    .map((slug) => spokePages.find((p) => p.slug === slug))
    .filter(Boolean);

  if (relatedPages.length === 0) return null;

  return (
    <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
      <Container maxWidth="md">
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
          Also Read
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {relatedPages.map((page) => (
            <Link
              key={page!.slug}
              href={`/${locale}/nata-2026/${page!.slug}`}
              style={{ textDecoration: 'none' }}
            >
              <Card
                sx={{
                  p: 2,
                  color: 'inherit',
                  transition: 'box-shadow 0.2s',
                  '&:hover': { boxShadow: 3 },
                }}
              >
                <Typography
                  variant="subtitle1"
                  color="primary.main"
                  sx={{ fontWeight: 600 }}
                >
                  {page!.title} &rarr;
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {page!.desc}
                </Typography>
              </Card>
            </Link>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
