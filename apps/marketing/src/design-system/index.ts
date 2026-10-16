/**
 * Neram marketing design system. Rules: apps/marketing/DESIGN_SYSTEM.md.
 * Rendered reference: /design-system (dev and staging only).
 */

export { tokens, surfaceVars, v, focusRing, hoverGoldBorder, eyebrowSx, iconTileSx, sectionPaddingY } from './tokens';

export { default as Surface } from './surface/Surface';
export type { SurfaceProps, SurfaceTone } from './surface/Surface';
export { default as DarkScope } from './surface/DarkScope';
export { default as Section } from './layout/Section';
export type { SectionProps, ContainerWidth } from './layout/Section';

export { default as PageHero } from './hero/PageHero';
export type { PageHeroProps } from './hero/PageHero';
export { default as DocHeader } from './hero/DocHeader';
export type { DocHeaderProps } from './hero/DocHeader';
export { default as Breadcrumb } from './Breadcrumb';
export type { BreadcrumbItem } from './Breadcrumb';

export { default as SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';
export { default as CtaButton } from './CtaButton';
export type { CtaButtonProps, CtaVariant } from './CtaButton';
export { default as CtaBand } from './CtaBand';
export type { CtaBandProps } from './CtaBand';
export { default as StatStrip } from './StatStrip';
export type { StatItem, StatStripProps } from './StatStrip';

export { default as FeatureCard, ToolCard } from './FeatureCard';
export type { FeatureCardProps } from './FeatureCard';
export { default as ProgramCard } from './ProgramCard';
export type { ProgramCardProps } from './ProgramCard';
export { default as CourseCard } from './CourseCard';
export type { CourseCardProps } from './CourseCard';
export { default as FaqList } from './FaqList';
export type { FaqItem, FaqListProps } from './FaqList';

export { default as CheckList } from './CheckList';
export type { CheckListProps } from './CheckList';
export { default as TopicCard } from './TopicCard';
export type { TopicCardProps } from './TopicCard';
export { default as PersonCard } from './PersonCard';
export type { PersonCardProps } from './PersonCard';
export { default as FeeCard } from './FeeCard';
export type { FeeCardProps } from './FeeCard';
export { default as AsideLayout } from './templates/AsideLayout';
export type { AsideLayoutProps } from './templates/AsideLayout';
export { default as Pill } from './forms/Pill';
export type { PillProps } from './forms/Pill';
export { default as EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { default as LightScope } from './surface/LightScope';
export type { LightScopeProps } from './surface/LightScope';
export { default as InlineCta } from './InlineCta';
export type { InlineCtaProps } from './InlineCta';
export { default as FactsCard } from './FactsCard';
export type { FactsCardProps } from './FactsCard';
