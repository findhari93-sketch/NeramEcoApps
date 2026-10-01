/**
 * Question Bank onboarding cache, kept per account so a second student on a
 * shared phone does not inherit the first student's answers.
 * localStorage can throw (private mode, blocked storage), so every access is guarded.
 */

const LEGACY_DONE_KEY = 'qb_onboarding_done';
const LEGACY_STATUS_KEY = 'qb_nata_status';

function keys(userId: string) {
  return {
    done: `${LEGACY_DONE_KEY}:${userId}`,
    status: `${LEGACY_STATUS_KEY}:${userId}`,
  };
}

export function readQbOnboarding(userId: string): { done: boolean; status: string | null } {
  try {
    const k = keys(userId);
    return {
      done: localStorage.getItem(k.done) === 'true',
      status: localStorage.getItem(k.status),
    };
  } catch {
    return { done: false, status: null };
  }
}

export function writeQbOnboarding(userId: string, status: string): void {
  try {
    const k = keys(userId);
    localStorage.setItem(k.done, 'true');
    localStorage.setItem(k.status, status);
    // The old device-wide keys leaked answers between accounts
    localStorage.removeItem(LEGACY_DONE_KEY);
    localStorage.removeItem(LEGACY_STATUS_KEY);
  } catch {
    // Storage unavailable: the API check runs again next visit
  }
}
