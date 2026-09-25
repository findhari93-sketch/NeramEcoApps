import type { Metadata } from 'next';
import AssistantHomeTab from '@/components/answer-pad/AssistantHomeTab';

export const metadata: Metadata = { title: 'Neram Assistant' };

/**
 * The Neram Assistant's personal tab in Teams (manifest staticTabs), and what
 * every Assistant Activity item opens. It must stay under /pad/teams: that is
 * the only path Teams may frame (vercel.json) and the only one that skips the
 * MSAL sign-in (lib/pad/embedded.ts).
 */
export default function AssistantHomePage() {
  return <AssistantHomeTab />;
}
