/**
 * Where each role's "home" actually lives.
 *
 * One map, because two copies drift. This started life inside RoleGuard, while
 * TopBar carried its own inline `nexusRole === 'student' ? ... : '/teacher/...'`
 * ternary. That ternary had no parent branch, so tapping the Nexus logo as a
 * parent sent them to the teacher dashboard, where RoleGuard bounced them back.
 * Silent, and invisible on desktop because the logo button is mobile only.
 *
 * The bare /teacher, /student and /parent paths have no index page and would
 * 404, so every entry here names a route that exists. Matches the redirects in
 * app/page.tsx.
 */

export type NexusHomeRole = 'admin' | 'teacher' | 'student' | 'parent';

export function getRoleDashboard(role: string | null | undefined): string {
  switch (role) {
    case 'admin':
    case 'teacher':
      return '/teacher/dashboard';
    case 'student':
      return '/student/dashboard';
    case 'parent':
      return '/parent/dashboard';
    default:
      return '/login';
  }
}

/**
 * Whether this role has a /{role}/profile and /{role}/guide page.
 *
 * TopBar's profile menu builds those paths from the role string, which works for
 * students and teachers and produces a guaranteed 404 for parents. Parents get a
 * profile page in a later phase; until then the menu items are hidden, because a
 * missing item is better than one that breaks.
 */
export function hasProfilePages(role: string | null | undefined): boolean {
  return role === 'student' || role === 'teacher' || role === 'admin';
}
