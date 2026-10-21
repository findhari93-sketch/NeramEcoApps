import { describe, it, expect } from 'vitest';
import { estimateNataCost } from './nata-cost';

describe('NATA cost estimate', () => {
  it('adds the fee, travel and materials for a state with a test city', () => {
    const c = estimateNataCost({ category: 'General/OBC(N-CL)', attempts: 2, homeState: 'Tamil Nadu', needAccommodation: false });
    expect(c).toMatchObject({ applicationFeePerAttempt: 1750, totalApplicationFee: 3500, estimatedTravel: 4000, accommodation: 0, totalMin: 9500, totalMax: 12500 });
  });

  it('charges more travel and stay for a state without one', () => {
    const c = estimateNataCost({ category: 'SC/ST/EWS/PwD', attempts: 1, homeState: 'Sikkim', needAccommodation: true });
    expect(c).toMatchObject({ totalApplicationFee: 1250, estimatedTravel: 5000, accommodation: 3000, totalMin: 11250 });
  });

  it('matches a state typed in any case and clamps attempts', () => {
    const c = estimateNataCost({ category: 'unknown', attempts: 9, homeState: 'tamil nadu', needAccommodation: false });
    expect(c.applicationFeePerAttempt).toBe(1750);
    expect(c.totalApplicationFee).toBe(5250);
    expect(c.estimatedTravel).toBe(6000);
  });
});
