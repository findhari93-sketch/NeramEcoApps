import { ComponentType } from 'react';

export interface ToolStep {
  title: string;
  desc: string;
}

export interface ToolFeature {
  title: string;
  desc: string;
}

export interface ToolFAQ {
  question: string;
  answer: string;
}

export interface ToolScreenshot {
  desktop: string;
  mobile: string;
  caption: string;
  alt: string;
}

export interface ToolConfig {
  slug: string;
  title: string;
  subtitle: string;
  category: 'nata' | 'counseling' | 'insights';
  appUrl: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  ogImageTitle: string;
  ogImageSubtitle: string;
  trustBadges: string[];
  steps: ToolStep[];
  features: ToolFeature[];
  screenshots: ToolScreenshot;
  contextHeading: string;
  contextContent: string;
  faqs: ToolFAQ[];
  relatedToolSlugs: string[];
  teaserComponent: ComponentType;
}

export interface ToolCardData {
  slug: string;
  title: string;
  description: string;
  category: 'nata' | 'counseling' | 'insights';
}
