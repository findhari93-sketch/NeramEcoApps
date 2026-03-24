export const ORG_NAME = 'Neram Classes';
export const ORG_ALTERNATE_NAME = 'Neram NATA Coaching';
export const BASE_URL = 'https://neramclasses.com';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';
export const ORG_LOGO = `${BASE_URL}/logo.png`;
export const ORG_PHONE = '+91-9176137043';
export const ORG_EMAIL = 'info@neramclasses.com';
export const ORG_FOUNDED = '2009';
export const ORG_FORMALLY_ESTABLISHED = '2016';
export const ORG_DESCRIPTION =
  "India's #1 NATA and JEE Paper 2 coaching institute since 2009. Expert IIT/NIT/SPA alumni faculty, AI-powered study app, 99.9% success rate, 10,000+ students trained across 150+ cities in India and Gulf countries. Online and offline hybrid coaching with free tools.";

// Differentiator tagline used across pages and structured data
export const ORG_SLOGAN = "India's #1 AI-Powered NATA Coaching Since 2009";
export const ORG_BEST_KNOWN_FOR = 'AI-powered study platform with free NATA tools, hybrid online-offline coaching across 150+ cities, and 99.9% success rate since 2009';

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
