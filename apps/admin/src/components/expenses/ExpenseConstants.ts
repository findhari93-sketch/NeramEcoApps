export const EXPENSE_CATEGORIES = [
  { value: 'staff_travel', label: 'Staff Travel', description: 'Transport, auto, bus, train, flight' },
  { value: 'staff_food', label: 'Staff Food', description: 'Food, tea, snacks, meals' },
  { value: 'staff_accommodation', label: 'Staff Accommodation', description: 'Hotel, room rent' },
  { value: 'google_ads', label: 'Google Ads', description: 'Google Ads / digital marketing' },
  { value: 'staff_salary', label: 'Staff Salary', description: 'Staff salaries' },
  { value: 'exam_center', label: 'Exam Center', description: 'Exam center visit expenses' },
  { value: 'cloud_tech', label: 'Cloud & Tech', description: 'Supabase, Vercel, domains, subscriptions' },
  { value: 'office_bills', label: 'Office & Bills', description: 'Internet, VPA, utilities' },
  { value: 'equipment', label: 'Equipment', description: 'Hardware, devices' },
  { value: 'misc_expense', label: 'Miscellaneous', description: 'Other expenses' },
] as const;

export const INCOME_CATEGORIES = [
  { value: 'college_referral', label: 'College Referral', description: 'Commission for student referrals' },
  { value: 'website_listing', label: 'Website Listing', description: 'College website listing fees' },
  { value: 'misc_income', label: 'Miscellaneous', description: 'Other side income' },
] as const;

export const ASSIGNMENT_STATUSES = [
  { value: 'active', label: 'Active', color: 'info' as const },
  { value: 'completed', label: 'Completed', color: 'warning' as const },
  { value: 'settled', label: 'Settled', color: 'success' as const },
] as const;

export function getCategoryLabel(category: string): string {
  const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  return all.find(c => c.value === category)?.label || category;
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    staff_travel: '#1976D2',
    staff_food: '#E64A19',
    staff_accommodation: '#7B1FA2',
    google_ads: '#0097A7',
    staff_salary: '#388E3C',
    exam_center: '#F57C00',
    cloud_tech: '#5C6BC0',
    office_bills: '#455A64',
    equipment: '#795548',
    misc_expense: '#9E9E9E',
    college_referral: '#2E7D32',
    website_listing: '#1565C0',
    misc_income: '#43A047',
  };
  return colors[category] || '#9E9E9E';
}

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
