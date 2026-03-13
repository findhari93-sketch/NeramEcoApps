export const ORG_NAME = 'Neram Classes';
export const ORG_ALTERNATE_NAME = 'Neram NATA Coaching';
export const BASE_URL = 'https://neramclasses.com';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';
export const ORG_LOGO = `${BASE_URL}/logo.png`;
export const ORG_PHONE = '+91-9176137043';
export const ORG_EMAIL = 'info@neramclasses.com';
export const ORG_FOUNDED = '2020';
export const ORG_DESCRIPTION =
  'Premier NATA and JEE Paper 2 coaching institute in Tamil Nadu, India. Expert IIT/NIT alumni faculty, comprehensive study materials, online and offline classes across India and Gulf countries.';

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
