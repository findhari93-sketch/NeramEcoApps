import StudentsTabs from '@/components/students/StudentsTabs';

/**
 * Shared shell for the Students area. Renders the persistent segmented tab bar
 * (All Students | City-Wise) above every students page so navigating between the
 * two views never loses the tabs. Detail/drill pages render nothing extra here
 * because StudentsTabs self-hides off the two top-level routes.
 */
export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StudentsTabs />
      {children}
    </>
  );
}
