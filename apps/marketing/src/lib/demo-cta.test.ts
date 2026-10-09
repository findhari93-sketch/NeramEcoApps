import { afterEach, describe, expect, it } from 'vitest';
import { getDemoCta, readDemoActive, writeDemoActive } from './demo-cta';

afterEach(() => window.localStorage.clear());

describe('getDemoCta', () => {
  const base = { pathname: '/', applicationStatus: null, enrolled: false, active: null };

  it('offers a free demo by default', () => {
    expect(getDemoCta(base)).toEqual({ label: 'freeDemo', href: '/demo-class' });
  });

  it('turns into My demo while a demo is open', () => {
    const active = { ref: 'DEMO-1', status: 'contacted', at: '2026-10-08T00:00:00Z' };
    expect(getDemoCta({ ...base, active })).toEqual({ label: 'myDemo', href: '/demo-class/my' });
  });

  it('goes back to Free demo when the stored demo is over', () => {
    const active = { ref: 'DEMO-1', status: 'completed', at: '2026-10-08T00:00:00Z' };
    expect(getDemoCta({ ...base, active })?.label).toBe('freeDemo');
  });

  it('hides for approved and enrolled students', () => {
    expect(getDemoCta({ ...base, applicationStatus: 'approved' })).toBeNull();
    expect(getDemoCta({ ...base, enrolled: true })).toBeNull();
  });

  it('hides on the demo pages themselves, with or without a locale', () => {
    expect(getDemoCta({ ...base, pathname: '/demo-class' })).toBeNull();
    expect(getDemoCta({ ...base, pathname: '/demo-class/my' })).toBeNull();
    expect(getDemoCta({ ...base, pathname: '/ta/demo-class' })).toBeNull();
    expect(getDemoCta({ ...base, pathname: '/demo-classes-guide' })).not.toBeNull();
  });
});

describe('demo active flag', () => {
  it('stores an open demo and clears it once the demo is over', () => {
    writeDemoActive({ ref: 'DEMO-9', status: 'pending' });
    expect(readDemoActive()).toMatchObject({ ref: 'DEMO-9', status: 'pending' });
    writeDemoActive({ ref: 'DEMO-9', status: 'cancelled' });
    expect(readDemoActive()).toBeNull();
    writeDemoActive({ ref: 'DEMO-9', status: 'approved' });
    writeDemoActive(null);
    expect(readDemoActive()).toBeNull();
  });

  it('ignores junk in storage', () => {
    window.localStorage.setItem('neram_demo_active', '{not json');
    expect(readDemoActive()).toBeNull();
  });
});
