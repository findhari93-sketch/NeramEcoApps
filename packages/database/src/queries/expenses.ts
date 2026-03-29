// @ts-nocheck
import { getSupabaseAdminClient } from '../client';
import type { FinancialTransaction, CreateFinancialTransactionInput, FinancialTransactionType, SettlementStatus } from '../types';

export interface ListTransactionsOptions {
  type?: FinancialTransactionType;
  category?: string;
  assignmentId?: string;
  settlementStatus?: SettlementStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listFinancialTransactions(options: ListTransactionsOptions = {}) {
  const supabase = getSupabaseAdminClient();
  const {
    type, category, assignmentId, settlementStatus,
    startDate, endDate, search,
    limit = 25, offset = 0,
  } = options;

  let query = supabase
    .from('financial_transactions')
    .select(`
      *,
      assignment:expense_assignments(id, title, staff_name)
    `, { count: 'exact' });

  if (type) query = query.eq('type', type);
  if (category) query = query.eq('category', category);
  if (assignmentId) query = query.eq('assignment_id', assignmentId);
  if (settlementStatus) query = query.eq('settlement_status', settlementStatus);
  if (startDate) query = query.gte('transaction_date', startDate);
  if (endDate) query = query.lte('transaction_date', endDate);
  if (search) query = query.ilike('description', `%${search}%`);

  query = query.order('transaction_date', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { transactions: data || [], count: count || 0 };
}

export async function getTransactionById(id: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('financial_transactions')
    .select(`
      *,
      assignment:expense_assignments(id, title, staff_name, city, status)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createFinancialTransaction(input: CreateFinancialTransactionInput) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('financial_transactions')
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as FinancialTransaction;
}

export async function updateFinancialTransaction(id: string, updates: Partial<FinancialTransaction>) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('financial_transactions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as FinancialTransaction;
}

export async function deleteFinancialTransaction(id: string) {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('financial_transactions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function bulkSettleTransactions(ids: string[]) {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('financial_transactions')
    .update({ settlement_status: 'settled', settled_at: now, updated_at: now })
    .in('id', ids)
    .select();

  if (error) throw error;
  return data;
}

export async function getTransactionStats(startDate?: string, endDate?: string) {
  const supabase = getSupabaseAdminClient();

  let query = supabase.from('financial_transactions').select('type, category, amount, settlement_status');
  if (startDate) query = query.gte('transaction_date', startDate);
  if (endDate) query = query.lte('transaction_date', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const stats = {
    total_expenses: 0,
    total_side_income: 0,
    unsettled_count: 0,
    unsettled_amount: 0,
    by_category: {} as Record<string, number>,
    top_category: '',
    top_category_amount: 0,
  };

  for (const txn of data || []) {
    const amount = Number(txn.amount);
    if (txn.type === 'expense') {
      stats.total_expenses += amount;
      stats.by_category[txn.category] = (stats.by_category[txn.category] || 0) + amount;
    } else {
      stats.total_side_income += amount;
    }
    if (txn.settlement_status === 'pending' && txn.type === 'expense') {
      stats.unsettled_count++;
      stats.unsettled_amount += amount;
    }
  }

  for (const [cat, amt] of Object.entries(stats.by_category)) {
    if (amt > stats.top_category_amount) {
      stats.top_category = cat;
      stats.top_category_amount = amt;
    }
  }

  return stats;
}
