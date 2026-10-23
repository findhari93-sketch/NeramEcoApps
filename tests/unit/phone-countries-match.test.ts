import { describe, it, expect } from 'vitest';
import { PHONE_COUNTRIES } from '../../packages/ui/src/components/LoginModal/phoneCountries';
import { MOBILE_COUNTRIES } from '../../packages/database/src/utils/phone';
import { SUPPORTED_COUNTRIES } from '../../apps/marketing/src/components/apply/countryConfig';

// Three packages carry the same mobile codes (none depends on another). The OTP
// dialog, the apply form and the servers that store the numbers must agree.
describe('mobile country lists', () => {
  const shape = (list: ReadonlyArray<{ code: string; length?: number; phoneLength?: number; prefix?: string; phonePrefix?: string }>) =>
    list.map((c) => [c.code, c.prefix ?? c.phonePrefix, c.length ?? c.phoneLength]);

  it('the OTP dialog offers exactly what the servers store', () => {
    expect(shape(PHONE_COUNTRIES)).toEqual(shape(MOBILE_COUNTRIES));
  });

  it('the apply form offers the same codes', () => {
    expect(shape(SUPPORTED_COUNTRIES)).toEqual(shape(MOBILE_COUNTRIES));
  });
});
