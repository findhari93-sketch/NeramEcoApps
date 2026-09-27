'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { BroadcastBanner, ImportantDateBanner, StickyAchievementWidget } from '@/components/marketing-content';
import ApplicationShell from '@/components/apply/shell/ApplicationShell';
import { isFocusedRoute } from '@/lib/focused-routes';

const GeneralChatbot = dynamic(() => import('@/components/GeneralChatbot'), { ssr: false });
const ComparisonTray = dynamic(() => import('@/components/college-hub/ComparisonTray'), { ssr: false });

interface SiteChromeProps {
  locale: string;
  children: React.ReactNode;
}

/**
 * One switch for the page chrome. Marketing pages keep every banner, the
 * header, the footer and the floating widgets exactly as before. The apply,
 * pay and enrol routes get the application shell and nothing floating, so a
 * student on a phone sees one task and one primary button.
 *
 * A pathname check rather than route groups: moving 200 pages into a route
 * group in a working tree that other sessions share was the riskier change.
 */
export default function SiteChrome({ locale, children }: SiteChromeProps) {
  const pathname = usePathname();

  if (isFocusedRoute(pathname)) {
    return <ApplicationShell>{children}</ApplicationShell>;
  }

  return (
    <>
      <BroadcastBanner locale={locale} />
      <ImportantDateBanner locale={locale} />
      <Header />
      <main>{children}</main>
      <Footer />
      <StickyAchievementWidget locale={locale} />
      <ComparisonTray />
      <GeneralChatbot />
    </>
  );
}
