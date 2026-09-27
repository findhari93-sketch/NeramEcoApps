import { ADMIN_ID_HEADER } from './admin-api-auth';

/**
 * The verified staff member behind this request, as stamped by middleware.ts.
 *
 * Use this instead of an `adminId` from the body or query: those are whatever
 * the caller chose to send. Returns null only when the route is exempt from the
 * middleware or the rollout switch is in `report` mode.
 */
export function getRequestAdminId(request: Request): string | null {
  const id = request.headers.get(ADMIN_ID_HEADER);
  return id && id.trim() ? id.trim() : null;
}
