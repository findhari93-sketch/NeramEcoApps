// @ts-nocheck
import { getSupabaseAdminClient } from '../client';
import type { ExpenseAssignment, CreateExpenseAssignmentInput, ExpenseAssignmentStatus } from '../types';

export interface ListAssignmentsOptions {
  status?: ExpenseAssignmentStatus;
  staffName?: string;
  city?: string;
  limit?: number;
  offset?: number;
}

export async function listExpenseAssignments(options: ListAssignmentsOptions = {}) {
  const supabase = getSupabaseAdminClient();
  const { status, staffName, city, limit = 25, offset = 0 } = options;

  let query = supabase
    .from('expense_assignments')
    .select('*', { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (staffName) query = query.ilike('staff_name', `%${staffName}%`);
  if (city) query = query.ilike('city', `%${city}%`);

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { assignments: data || [], count: count || 0 };
}

export async function getExpenseAssignmentById(id: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('expense_assignments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as ExpenseAssignment;
}

export async function createExpenseAssignment(input: CreateExpenseAssignmentInput) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('expense_assignments')
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as ExpenseAssignment;
}

export async function updateExpenseAssignment(id: string, updates: Partial<ExpenseAssignment>) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('expense_assignments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as ExpenseAssignment;
}

export async function settleAssignment(id: string) {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: assignment, error: assignmentError } = await supabase
    .from('expense_assignments')
    .update({ status: 'settled', settled_at: now, updated_at: now })
    .eq('id', id)
    .select()
    .single();

  if (assignmentError) throw assignmentError;

  const { error: txnError } = await supabase
    .from('financial_transactions')
    .update({ settlement_status: 'settled', settled_at: now, updated_at: now })
    .eq('assignment_id', id)
    .eq('settlement_status', 'pending');

  if (txnError) throw txnError;

  return assignment as ExpenseAssignment;
}

export async function getAssignmentExpenseSummary(id: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('financial_transactions')
    .select('category, amount, settlement_status')
    .eq('assignment_id', id);

  if (error) throw error;

  const summary = {
    total: 0,
    by_category: {} as Record<string, number>,
    pending_count: 0,
    settled_count: 0,
    expense_count: data?.length || 0,
  };

  for (const txn of data || []) {
    summary.total += Number(txn.amount);
    summary.by_category[txn.category] = (summary.by_category[txn.category] || 0) + Number(txn.amount);
    if (txn.settlement_status === 'pending') summary.pending_count++;
    else summary.settled_count++;
  }

  return summary;
}
