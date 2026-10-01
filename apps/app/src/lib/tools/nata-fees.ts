/**
 * NATA application fee per attempt (NATA 2026 brochure). Shared by the public
 * demo and the full cost calculator. Update when the new brochure is out.
 */
export const NATA_FEE_YEAR = 2026;

export const NATA_FEES: Record<string, number> = {
  'General/OBC(N-CL)': 1750,
  'SC/ST/EWS/PwD': 1250,
  Transgender: 1000,
  'Outside India': 15000,
};
