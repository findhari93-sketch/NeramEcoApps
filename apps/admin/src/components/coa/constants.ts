import type { CoaApprovalStatus } from '@neram/database';

export const COA_STATUS_CONFIG: Record<
  CoaApprovalStatus,
  { label: string; color: string; chipColor: 'success' | 'warning' | 'error' }
> = {
  active: {
    label: 'Active (2025-26)',
    color: '#10B981',
    chipColor: 'success',
  },
  expiring: {
    label: 'Valid till 2025',
    color: '#F59E0B',
    chipColor: 'warning',
  },
  unknown: {
    label: 'Check with COA',
    color: '#EF4444',
    chipColor: 'error',
  },
};

export const COA_STATES = [
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu & Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Meghalaya',
  'Mizoram',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'UAE',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];
