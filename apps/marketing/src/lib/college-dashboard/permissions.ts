/**
 * Who can do what in the college dashboard (/college-dashboard).
 *
 * owner  : everything, including inviting and removing teammates.
 * editor : edit the college page (through staff review), handle leads, reply to reviews.
 * viewer : read only.
 *
 * 'admin' is the role name before 20261127090000 and counts as owner.
 */
export type CollegeRole = 'owner' | 'editor' | 'viewer';

export type CollegeAction = 'view' | 'edit_content' | 'manage_leads' | 'reply_reviews' | 'manage_team';

const ALLOWED: Record<CollegeRole, readonly CollegeAction[]> = {
  owner: ['view', 'edit_content', 'manage_leads', 'reply_reviews', 'manage_team'],
  editor: ['view', 'edit_content', 'manage_leads', 'reply_reviews'],
  viewer: ['view'],
};

export const ROLE_LABEL: Record<CollegeRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_HELP: Record<CollegeRole, string> = {
  owner: 'Manages the team and everything else',
  editor: 'Edits the college page and handles enquiries',
  viewer: 'Can look, cannot change anything',
};

export function normalizeRole(role: string | null | undefined): CollegeRole {
  if (role === 'owner' || role === 'admin') return 'owner';
  if (role === 'editor') return 'editor';
  return 'viewer';
}

export function can(role: string | null | undefined, action: CollegeAction): boolean {
  return ALLOWED[normalizeRole(role)].includes(action);
}

export function isCollegeRole(value: unknown): value is CollegeRole {
  return value === 'owner' || value === 'editor' || value === 'viewer';
}
