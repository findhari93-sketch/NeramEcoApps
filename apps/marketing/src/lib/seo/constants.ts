export const ORG_NAME = 'Neram Classes';
export const ORG_ALTERNATE_NAME = 'Neram NATA Coaching';
export const BASE_URL = 'https://neramclasses.com';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';
export const ORG_LOGO = `${BASE_URL}/logo.png`;
export const ORG_PHONE = '+91-9176137043';
export const ORG_EMAIL = 'info@neramclasses.com';
export const ORG_FOUNDED = '2009';
export const ORG_FORMALLY_ESTABLISHED = '2016';
// Verifiable facts only (see lib/seo/facts.ts). Unverifiable claims such as "#1",
// success percentages and "150+ cities" were removed: they weaken the entity for
// Google and AI assistants and risk a structured-data manual action.
export const ORG_DESCRIPTION =
  'NATA, JEE Main Paper 2 (B.Arch), AAT and PGETA coaching since 2009. Live online classes across India and the Gulf, classroom batches in Tamil Nadu and Bangalore, drawing feedback, mock tests and free NATA tools.';

// Differentiator tagline used across pages and structured data
export const ORG_SLOGAN = 'Architecture entrance coaching since 2009';
export const ORG_BEST_KNOWN_FOR =
  'Live online and classroom coaching for NATA and JEE Paper 2, with free NATA tools such as a cutoff calculator, college predictor and exam centre finder';

export const ORG_ADDRESS = {
  streetAddress: 'Electronic City Phase 1, Near M5 Mall',
  addressLocality: 'Bangalore',
  addressRegion: 'Karnataka',
  postalCode: '560100',
  addressCountry: 'IN',
};

export const SOCIAL_PROFILES = [
  'https://www.youtube.com/@neramclassesnata',
  'https://www.instagram.com/neramclasses/',
  'https://www.facebook.com/neramclasses',
  'https://www.linkedin.com/company/neramclasses',
];

export const SUPPORTED_LOCALES = ['en', 'ta', 'hi', 'kn', 'ml'] as const;
export const DEFAULT_LOCALE = 'en';

export const DEFAULT_OG_IMAGE = {
  url: `${BASE_URL}/og-default.png`,
  width: 1200,
  height: 630,
  alt: `${ORG_NAME} - Best NATA & JEE Paper 2 Coaching in India`,
};

// App-specific constants for AEO
export const APP_NAME = 'Neram - Free NATA Exam Preparation App';
export const APP_SHORT_NAME = 'Neram NATA App';
export const APP_DESCRIPTION =
  'Free NATA preparation app with cutoff calculator, college predictor for 5000+ colleges, and exam center finder. Used by 5000+ students across India.';
export const APP_FEATURES = [
  'NATA Cutoff Calculator',
  'College Predictor (5000+ colleges)',
  'Exam Center Locator',
  'Previous Year Papers',
  'Study Materials & E-books',
  'Personalized Study Plans',
  'Progress Tracking Dashboard',
  'Mock Tests with Analysis',
];
