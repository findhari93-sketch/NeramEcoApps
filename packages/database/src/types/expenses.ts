export type ExpenseAssignmentStatus = 'active' | 'completed' | 'settled';
export type FinancialTransactionType = 'expense' | 'income';
export type SettlementStatus = 'pending' | 'settled';

export type ExpenseCategory =
  | 'staff_travel'
  | 'staff_food'
  | 'staff_accommodation'
  | 'google_ads'
  | 'staff_salary'
  | 'exam_center'
  | 'cloud_tech'
  | 'office_bills'
  | 'equipment'
  | 'misc_expense';

export type IncomeCategory =
  | 'college_referral'
  | 'website_listing'
  | 'misc_income';

export type TransactionCategory = ExpenseCategory | IncomeCategory;

export interface ExpenseAssignment {
  id: string;
  title: string;
  staff_name: string;
  city: string | null;
  start_date: string;
  end_date: string | null;
  status: ExpenseAssignmentStatus;
  settled_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialTransaction {
  id: string;
  type: FinancialTransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  transaction_date: string;
  assignment_id: string | null;
  settlement_status: SettlementStatus;
  settled_at: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateFinancialTransactionInput {
  type: FinancialTransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  transaction_date: string;
  assignment_id?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
  created_by: string;
}

export interface CreateExpenseAssignmentInput {
  title: string;
  staff_name: string;
  city?: string | null;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
  created_by: string;
}
