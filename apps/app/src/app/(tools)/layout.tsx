import { SidebarProvider } from '@/contexts/SidebarContext';
import StudentSession from '@/components/shell/StudentSession';

/**
 * Public tool pages. Visitors and crawlers get the page in a light public
 * header; signed-in students get the same page inside the app shell. Nothing
 * here blocks rendering, so every page stays fully server-rendered (ISR).
 */
export default function PublicToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <StudentSession mode="optional">{children}</StudentSession>
    </SidebarProvider>
  );
}
