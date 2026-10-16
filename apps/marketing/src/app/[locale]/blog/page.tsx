import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { ReactElement } from 'react';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';
import WorkOutlineOutlinedIcon from '@mui/icons-material/WorkOutlineOutlined';
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import RETIRED_CITY_GUIDES from '@/data/geo/retired-city-guides.json';
import { CtaBand, CtaButton, HubIndex, type HubGroup } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA & Architecture Blog - Tips, News & Guides',
    description: 'Read the latest articles on NATA preparation, architecture career, JEE Paper 2 tips, and more. Expert insights from Neram Classes faculty.',
    keywords: 'NATA blog, architecture blog, NATA preparation tips, JEE Paper 2 articles, architecture career',
    alternates: buildAlternates(locale, '/blog'),
  };
}

interface PageProps {
  params: { locale: string };
}

// Static blog posts data (will be replaced with database fetch)
const blogPosts = [
  {
    slug: 'nata-2026-preparation-strategy',
    title: 'NATA 2026 Preparation Strategy: Complete Guide for Aspirants',
    excerpt: 'Learn the complete preparation strategy for NATA 2026 with expert tips on drawing, aptitude, and mathematics preparation.',
    category: 'Preparation',
    author: 'Neram Classes',
    publishedAt: '2026-01-15',
    readTime: '8 min read',
    featured: true,
  },
  {
    slug: 'top-10-drawing-techniques-nata',
    title: 'Top 10 Drawing Techniques Every NATA Aspirant Must Master',
    excerpt: 'Master these essential drawing techniques to score high in the NATA drawing section. Expert tips from our faculty.',
    category: 'Drawing',
    author: 'Neram Classes',
    publishedAt: '2025-01-10',
    readTime: '6 min read',
    featured: true,
  },
  {
    slug: 'best-nata-coaching-chennai',
    title: 'Best NATA Coaching in Chennai - Complete Guide 2026',
    excerpt: 'Find the best NATA coaching institutes in Chennai. Compare features, fees, and success rates to make the right choice.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2025-01-05',
    readTime: '5 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-coimbatore',
    title: 'Best NATA Coaching in Coimbatore - Top Institutes 2026',
    excerpt: 'Comprehensive guide to NATA coaching in Coimbatore. Find the right coaching institute for your preparation.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2025-01-03',
    readTime: '5 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-madurai',
    title: 'Best NATA Coaching in Madurai - Expert Guide 2026',
    excerpt: 'Looking for NATA coaching in Madurai? Here is everything you need to know about preparation options.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2025-01-02',
    readTime: '5 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-trichy',
    title: 'Best NATA Coaching in Trichy - Top Choices 2026',
    excerpt: 'Discover the best NATA coaching options in Trichy. Compare and choose the right coaching for your success.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2025-01-01',
    readTime: '5 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-pudukkottai',
    title: 'Best NATA Coaching in Pudukkottai - Neram Classes HQ 2026',
    excerpt: 'Looking for NATA coaching in Pudukkottai? As the headquarters of Neram Classes, Pudukkottai students get direct access to our expert faculty and personalized coaching.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-01-10',
    readTime: '17 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-salem',
    title: 'Best NATA Coaching in Salem - Complete Guide 2026',
    excerpt: 'Find the best NATA coaching in Salem, the Steel City of India. Expert architecture entrance preparation with flexible online and offline options.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-01-08',
    readTime: '16 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-tiruppur',
    title: 'Best NATA Coaching in Tiruppur - Expert Guide 2026',
    excerpt: 'Discover the best NATA coaching for Tiruppur students. World-class architecture entrance preparation through expert online and offline coaching.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-01-05',
    readTime: '17 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-bangalore',
    title: 'Best NATA Coaching in Bangalore 2026 - Complete Guide',
    excerpt: 'Find the best NATA coaching in Bangalore. Expert online and offline classes for architecture aspirants in India\'s IT capital.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-01-22',
    readTime: '15 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-dubai',
    title: 'Best NATA Coaching for Students in Dubai 2026',
    excerpt: 'Looking for NATA coaching in Dubai? Neram Classes offers comprehensive online NATA preparation for Indian students in the UAE.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-01',
    readTime: '15 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-doha',
    title: 'Best NATA Coaching for Students in Doha 2026',
    excerpt: 'Expert NATA coaching for Indian students in Doha, Qatar. Online live classes with timezone accommodation and personal mentoring.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-05',
    readTime: '14 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-muscat',
    title: 'Best NATA Coaching for Students in Muscat 2026',
    excerpt: 'Comprehensive NATA coaching for Indian students in Muscat, Oman. Online live interactive classes with expert IIT/NIT alumni faculty.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-08',
    readTime: '14 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-riyadh',
    title: 'Best NATA Coaching for Students in Riyadh 2026',
    excerpt: 'Top NATA coaching for Indian students in Riyadh, Saudi Arabia. Online classes with weekend batches and Gulf timezone support.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-10',
    readTime: '14 min read',
    featured: false,
  },
  {
    slug: 'best-nata-coaching-kuwait-city',
    title: 'Best NATA Coaching for Students in Kuwait City 2026',
    excerpt: 'Expert NATA preparation for Indian students in Kuwait City. Online coaching with Gulf timezone accommodation and complete study materials.',
    category: 'City Guide',
    author: 'Neram Classes',
    publishedAt: '2026-02-12',
    readTime: '14 min read',
    featured: false,
  },
];

// Category order for the tabs; a category with no live posts is not shown.
const categories = ['Preparation', 'Drawing', 'City Guide', 'Career', 'News'];

const CATEGORY_ICON: Record<string, () => ReactElement> = {
  Preparation: () => <MenuBookOutlinedIcon />,
  Drawing: () => <BrushOutlinedIcon />,
  'City Guide': () => <LocationCityOutlinedIcon />,
  Career: () => <WorkOutlineOutlinedIcon />,
  News: () => <NewspaperOutlinedIcon />,
};

const slugKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export default function BlogPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  // City guides were folded into the city coaching pages (they 301 there).
  const livePosts = blogPosts.filter((post) => !(post.slug in RETIRED_CITY_GUIDES));
  const baseUrl = 'https://neramclasses.com';

  // Featured posts first inside each category, then newest first.
  const ordered = [...livePosts].sort(
    (a, b) => Number(b.featured) - Number(a.featured) || b.publishedAt.localeCompare(a.publishedAt),
  );

  const groups: HubGroup[] = categories
    .map((cat) => ({
      key: slugKey(cat),
      label: cat,
      items: ordered
        .filter((post) => post.category === cat)
        .map((post) => ({
          href: `/blog/${post.slug}`,
          title: post.title,
          desc: post.excerpt,
          icon: (CATEGORY_ICON[cat] ?? (() => <ArticleOutlinedIcon />))(),
          badge: post.readTime || undefined,
          keywords: `${post.category} ${post.author}`,
        })),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Blog' },
        ])}
      />

      <HubIndex
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Blog' }]}
        eyebrow="Blog · Neram Classes"
        title="NATA & Architecture Blog"
        lede="Expert insights, preparation tips, and latest news for architecture aspirants"
        searchPlaceholder="Search articles, e.g. drawing, strategy"
        allLabel="All"
        countNoun="articles"
        cardCta="Read"
        groups={groups}
      >
        <CtaBand
          eyebrow="Newsletter"
          title="Stay Updated"
          lede="Get the latest articles and tips delivered to your inbox"
          actions={<CtaButton href="/apply">Subscribe Now</CtaButton>}
        />
      </HubIndex>
    </>
  );
}
