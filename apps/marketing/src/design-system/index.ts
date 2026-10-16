/**
 * Neram marketing design system. Rules: apps/marketing/DESIGN_SYSTEM.md.
 * Rendered reference: /design-system (dev and staging only).
 */

export { tokens, surfaceVars, v, focusRing, hoverGoldBorder, eyebrowSx, indicLabelSx, iconTileSx, sectionPaddingY } from './tokens';
export { brandColors, errorColor } from './brand-colors';

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
export type { CheckListProps, CheckListDetail } from './CheckList';
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
export { default as QuickCheck, QuickCheckResult } from './QuickCheck';
export type { QuickCheckProps, QuickCheckResultProps } from './QuickCheck';
export { default as StepList } from './StepList';
export type { StepItem, StepListProps } from './StepList';
export { default as LinkTile } from './LinkTile';
export type { LinkTileProps } from './LinkTile';
export { default as StatusBanner } from './StatusBanner';
export type { StatusBannerProps, BannerStatus } from './StatusBanner';
export { default as Timeline } from './Timeline';
export type { TimelineItem, TimelineState } from './Timeline';
export { default as FactGrid } from './FactGrid';
export type { FactGridProps } from './FactGrid';
export { default as NavCard } from './NavCard';
export type { NavCardProps, NavCardLink } from './NavCard';
export { default as DocLayout } from './templates/DocLayout';
export type { DocLayoutProps } from './templates/DocLayout';
export { default as DataTable } from './DataTable';
export type { DataTableProps } from './DataTable';
export { default as GuideNav } from './GuideNav';
export type { GuideNavProps, GuideNavItem } from './GuideNav';
export { default as ArticleSection } from './ArticleSection';
export type { ArticleSectionProps } from './ArticleSection';
export { default as InfoCard } from './InfoCard';
export type { InfoCardProps } from './InfoCard';
export { default as GuideArticle } from './templates/GuideArticle';
export type { GuideArticleProps } from './templates/GuideArticle';
export { default as Callout } from './Callout';
export type { CalloutProps } from './Callout';
export { default as HubCard } from './HubCard';
export type { HubCardProps } from './HubCard';
export { default as HubIndex } from './templates/HubIndex';
export type { HubIndexProps, HubGroup, HubItem } from './templates/HubIndex';
export { default as ReviewCard, ReviewWall } from './ReviewCard';
export type { ReviewCardProps } from './ReviewCard';
export { default as FilterBar, FilterSelect } from './FilterBar';
export type { FilterBarProps, FilterSelectProps } from './FilterBar';
export { default as LegalPage } from './templates/LegalPage';
export type { LegalPageProps, LegalSection } from './templates/LegalPage';
