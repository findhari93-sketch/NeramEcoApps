/**
 * Country Configuration for Multi-Country Location Support
 *
 * Defines postal code formats, phone prefixes, and location field
 * configurations for India and Gulf countries.
 */

export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  phonePrefix: string;
  phonePlaceholder: string;
  phoneLength: number;
  phonePattern: RegExp;
  postalCode: {
    label: string;
    required: boolean;
    format: RegExp | null;
    maxLength: number;
    placeholder: string;
    inputMode: 'numeric' | 'text';
    helperText: string;
    lookupSupported: boolean;
  };
  locationFields: {
    stateLabel: string;
    stateRequired: boolean;
    stateOptions: Array<{ value: string; label: string }> | null;
    cityRequired: boolean;
  };
}

export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    phonePrefix: '+91',
    phonePlaceholder: '9876543210',
    phoneLength: 10,
    phonePattern: /^[6-9]\d{9}$/,
    postalCode: {
      label: 'Pin Code',
      required: true,
      format: /^\d{6}$/,
      maxLength: 6,
      placeholder: '600001',
      inputMode: 'numeric',
      helperText: 'Enter 6-digit pin code for auto-fill',
      lookupSupported: true,
    },
    locationFields: {
      stateLabel: 'State',
      stateRequired: true,
      stateOptions: null,
      cityRequired: true,
    },
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    phonePrefix: '+971',
    phonePlaceholder: '501234567',
    phoneLength: 9,
    phonePattern: /^\d{9}$/,
    postalCode: {
      label: 'P.O. Box (Optional)',
      required: false,
      format: null,
      maxLength: 10,
      placeholder: '',
      inputMode: 'text',
      helperText: 'Optional',
      lookupSupported: false,
    },
    locationFields: {
      stateLabel: 'Emirate',
      stateRequired: true,
      stateOptions: [
        { value: 'Dubai', label: 'Dubai' },
        { value: 'Abu Dhabi', label: 'Abu Dhabi' },
        { value: 'Sharjah', label: 'Sharjah' },
        { value: 'Ajman', label: 'Ajman' },
        { value: 'Umm Al Quwain', label: 'Umm Al Quwain' },
        { value: 'Ras Al Khaimah', label: 'Ras Al Khaimah' },
        { value: 'Fujairah', label: 'Fujairah' },
      ],
      cityRequired: false,
    },
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    phonePrefix: '+966',
    phonePlaceholder: '512345678',
    phoneLength: 9,
    phonePattern: /^\d{9}$/,
    postalCode: {
      label: 'Postal Code',
      required: false,
      format: /^\d{5}$/,
      maxLength: 5,
      placeholder: '12345',
      inputMode: 'numeric',
      helperText: 'Optional 5-digit postal code',
      lookupSupported: true,
    },
    locationFields: {
      stateLabel: 'Region',
      stateRequired: true,
      stateOptions: [
        { value: 'Riyadh', label: 'Riyadh' },
        { value: 'Makkah', label: 'Makkah' },
        { value: 'Madinah', label: 'Madinah' },
        { value: 'Eastern Province', label: 'Eastern Province' },
        { value: 'Asir', label: 'Asir' },
        { value: 'Tabuk', label: 'Tabuk' },
        { value: 'Hail', label: "Ha'il" },
        { value: 'Northern Borders', label: 'Northern Borders' },
        { value: 'Jazan', label: 'Jazan' },
        { value: 'Najran', label: 'Najran' },
        { value: 'Al Baha', label: 'Al Baha' },
        { value: 'Al Jawf', label: 'Al Jawf' },
        { value: 'Qassim', label: 'Qassim' },
      ],
      cityRequired: true,
    },
  },
  {
    code: 'QA',
    name: 'Qatar',
    flag: '🇶🇦',
    phonePrefix: '+974',
    phonePlaceholder: '55123456',
    phoneLength: 8,
    phonePattern: /^\d{8}$/,
    postalCode: {
      label: 'Postal Code (Optional)',
      required: false,
      format: null,
      maxLength: 10,
      placeholder: '',
      inputMode: 'text',
      helperText: 'Optional',
      lookupSupported: false,
    },
    locationFields: {
      stateLabel: 'Municipality',
      stateRequired: true,
      stateOptions: [
        { value: 'Doha', label: 'Doha' },
        { value: 'Al Rayyan', label: 'Al Rayyan' },
        { value: 'Al Wakrah', label: 'Al Wakrah' },
        { value: 'Al Khor', label: 'Al Khor' },
        { value: 'Al Shamal', label: 'Al Shamal' },
        { value: 'Umm Salal', label: 'Umm Salal' },
        { value: 'Al Daayen', label: 'Al Daayen' },
        { value: 'Al Shahaniya', label: 'Al Shahaniya' },
      ],
      cityRequired: false,
    },
  },
  {
    code: 'OM',
    name: 'Oman',
    flag: '🇴🇲',
    phonePrefix: '+968',
    phonePlaceholder: '92123456',
    phoneLength: 8,
    phonePattern: /^\d{8}$/,
    postalCode: {
      label: 'Postal Code',
      required: false,
      format: /^\d{3}$/,
      maxLength: 3,
      placeholder: '100',
      inputMode: 'numeric',
      helperText: 'Optional 3-digit postal code',
      lookupSupported: true,
    },
    locationFields: {
      stateLabel: 'Governorate',
      stateRequired: true,
      stateOptions: [
        { value: 'Muscat', label: 'Muscat' },
        { value: 'Dhofar', label: 'Dhofar' },
        { value: 'Musandam', label: 'Musandam' },
        { value: 'Al Buraimi', label: 'Al Buraimi' },
        { value: 'Ad Dakhiliyah', label: 'Ad Dakhiliyah' },
        { value: 'Al Batinah North', label: 'Al Batinah North' },
        { value: 'Al Batinah South', label: 'Al Batinah South' },
        { value: 'Ash Sharqiyah North', label: 'Ash Sharqiyah North' },
        { value: 'Ash Sharqiyah South', label: 'Ash Sharqiyah South' },
        { value: 'Ad Dhahirah', label: 'Ad Dhahirah' },
        { value: 'Al Wusta', label: 'Al Wusta' },
      ],
      cityRequired: true,
    },
  },
];

export function getCountryConfig(code: string): CountryConfig {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code) || SUPPORTED_COUNTRIES[0];
}
