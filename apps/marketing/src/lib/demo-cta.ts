/**
 * The header's demo button reads a small browser flag instead of calling the
 * API on every page: the booking card writes it when a demo is booked or an
 * open one is found, and My demo clears it once the demo is over.
 */

const ACTIVE_KEY = 'neram_demo_active';
const OPEN_STATUSES = ['pending', 'contacted', 'approved'];

export interface DemoActiveFlag {
  ref: string;
  status: string;
  at: string;
}

export function readDemoActive(): DemoActiveFlag | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const flag = JSON.parse(raw) as DemoActiveFlag;
    return flag && typeof flag.ref === 'string' ? flag : null;
  } catch {
    return null;
  }
}

/** Remember an open demo, or forget it when the status says it is over. */
export function writeDemoActive(request: { ref: string; status: string } | null): void {
  try {
    if (request && OPEN_STATUSES.includes(request.status)) {
      const flag: DemoActiveFlag = { ref: request.ref, status: request.status, at: new Date().toISOString() };
      window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(flag));
    } else {
      window.localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // Storage blocked: the header just shows "Free demo".
  }
}

export interface DemoCta {
  label: 'freeDemo' | 'myDemo';
  href: '/demo-class' | '/demo-class/my';
}

/**
 * What the header's demo button shows, or null to hide it: hidden for
 * approved and enrolled students (they are past the demo) and on the demo
 * pages themselves.
 */
export function getDemoCta(opts: {
  pathname: string;
  applicationStatus?: string | null;
  enrolled?: boolean;
  active: DemoActiveFlag | null;
}): DemoCta | null {
  const path = opts.pathname.replace(/^\/(en|ta|hi|kn|ml)(?=\/|$)/, '') || '/';
  if (path === '/demo-class' || path.startsWith('/demo-class/') || path.startsWith('/d/')) return null;
  if (opts.enrolled || opts.applicationStatus === 'approved' || opts.applicationStatus === 'enrolled') return null;
  if (opts.active && OPEN_STATUSES.includes(opts.active.status)) return { label: 'myDemo', href: '/demo-class/my' };
  return { label: 'freeDemo', href: '/demo-class' };
}
