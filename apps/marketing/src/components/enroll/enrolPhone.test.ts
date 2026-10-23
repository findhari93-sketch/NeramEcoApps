import { describe, it, expect } from 'vitest';
import { splitEnrolPhone, joinEnrolPhone } from './enrolPhone';

describe('splitEnrolPhone', () => {
  it('reads an Indian number', () => {
    expect(splitEnrolPhone('+919500732502', 'IN')).toEqual({ phone: '9500732502', phoneCountry: 'IN' });
  });

  it('finds the UAE from the code even when the form still says India', () => {
    expect(splitEnrolPhone('+971551993240', 'IN')).toEqual({ phone: '551993240', phoneCountry: 'AE' });
  });

  it('keeps a half-typed Gulf number under the picked country', () => {
    expect(splitEnrolPhone('+96655', 'SA')).toEqual({ phone: '55', phoneCountry: 'SA' });
  });

  it('reads bare digits from an older save as India', () => {
    expect(splitEnrolPhone('9500732502', undefined)).toEqual({ phone: '9500732502', phoneCountry: 'IN' });
  });

  it('is empty for nothing, on the picked country', () => {
    expect(splitEnrolPhone('', 'QA')).toEqual({ phone: '', phoneCountry: 'QA' });
  });
});

describe('joinEnrolPhone', () => {
  it('puts the country code in front', () => {
    expect(joinEnrolPhone('551993240', 'AE')).toBe('+971551993240');
    expect(joinEnrolPhone('9500732502', 'IN')).toBe('+919500732502');
  });

  it('saves nothing for no digits', () => {
    expect(joinEnrolPhone('', 'AE')).toBe('');
  });

  it('round-trips through split', () => {
    const joined = joinEnrolPhone('92123456', 'OM');
    expect(splitEnrolPhone(joined, 'IN')).toEqual({ phone: '92123456', phoneCountry: 'OM' });
  });
});
