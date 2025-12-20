// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Email Queries
 *
 * Database queries for email templates and logs
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { EmailTemplate, EmailLog } from '../types';

// ============================================
// EMAIL TEMPLATE QUERIES
// ============================================

/**
 * Get email template by ID
 */
export async function getEmailTemplateById(
  templateId: string,
  client?: TypedSupabaseClient
): Promise<EmailTemplate | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get email template by slug
 */
export async function getEmailTemplate(
  slug: string,
  client?: TypedSupabaseClient
): Promise<EmailTemplate | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * List email templates
 */
export async function listEmailTemplates(
  options: { isActive?: boolean } = {},
  client?: TypedSupabaseClient
): Promise<EmailTemplate[]> {
  const supabase = client || getSupabaseAdminClient();

  const { isActive } = options;

  let query = supabase
    .from('email_templates')
    .select('*');

  if (isActive !== undefined) {
    query = query.eq('is_active', isActive);
  }

  query = query.order('name', { ascending: true });

  const { data, error } = await query;

  if (error) throw error;

  return data || [];
}

/**
 * Get active email templates
 */
export async function getActiveEmailTemplates(
  client?: TypedSupabaseClient
): Promise<EmailTemplate[]> {
  return listEmailTemplates({ isActive: true }, client);
}

// ============================================
// TEMPLATE RENDERING
// ============================================

/**
 * Render email template with variables
 */
export function renderEmailTemplate(
  template: EmailTemplate,
  variables: Record<string, string>,
  language: string = 'en'
): { subject: string; bodyHtml: string; bodyText: string } {
  const subject = template.subject[language] || template.subject['en'] || '';
  const bodyHtml = template.body_html[language] || template.body_html['en'] || '';
  const bodyText = template.body_text[language] || template.body_text['en'] || '';

  // Replace variables
  const replaceVars = (text: string): string => {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  };

  return {
    subject: replaceVars(subject),
    bodyHtml: replaceVars(bodyHtml),
    bodyText: replaceVars(bodyText),
  };
}

// ============================================
// EMAIL LOG QUERIES
// ============================================

/**
 * Create email log entry
 */
export async function createEmailLog(
  logData: Omit<EmailLog, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<EmailLog> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('email_logs')
    .insert(logData)
    .select()
    .single();

  if (error) throw error;
  return data as EmailLog;
}

/**
 * Update email log status
 */
export async function updateEmailLogStatus(
  logId: string,
  status: 'pending' | 'sent' | 'failed' | 'bounced',
  metadata?: { resend_id?: string; error_message?: string; sent_at?: string },
  client?: TypedSupabaseClient
): Promise<EmailLog> {
  const supabase = client || getSupabaseAdminClient();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (metadata?.resend_id) {
    updates.resend_id = metadata.resend_id;
  }

  if (metadata?.error_message) {
    updates.error_message = metadata.error_message;
  }

  if (status === 'sent') {
    updates.sent_at = metadata?.sent_at || new Date().toISOString();
  }

  const { data, error } = await (supabase as any)
    .from('email_logs')
    .update(updates)
    .eq('id', logId)
    .select()
    .single();

  if (error) throw error;
  return data as EmailLog;
}

/**
 * Mark email as sent
 */
export async function markEmailSent(
  logId: string,
  resendId?: string,
  client?: TypedSupabaseClient
): Promise<EmailLog> {
  return updateEmailLogStatus(logId, 'sent', { resend_id: resendId }, client);
}

/**
 * Mark email as failed
 */
export async function markEmailFailed(
  logId: string,
  errorMessage: string,
  client?: TypedSupabaseClient
): Promise<EmailLog> {
  return updateEmailLogStatus(logId, 'failed', { error_message: errorMessage }, client);
}

// ============================================
// EMAIL LOG LIST QUERIES
// ============================================

export interface ListEmailLogsOptions {
  userId?: string;
  templateId?: string;
  status?: 'pending' | 'sent' | 'failed' | 'bounced';
  toEmail?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * List email logs
 */
export async function listEmailLogs(
  options: ListEmailLogsOptions = {},
  client?: TypedSupabaseClient
): Promise<{ logs: EmailLog[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  const {
    userId,
    templateId,
    status,
    toEmail,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = options;

  let query = supabase
    .from('email_logs')
    .select('*', { count: 'exact' });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (templateId) {
    query = query.eq('template_id', templateId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (toEmail) {
    query = query.eq('to_email', toEmail);
  }

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    logs: data || [],
    count: count || 0,
  };
}

// ============================================
// EMAIL LOG STATISTICS
// ============================================

export interface EmailLogStats {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  bounced: number;
}

/**
 * Get email log statistics
 */
export async function getEmailLogStats(
  options: { startDate?: string; endDate?: string } = {},
  client?: TypedSupabaseClient
): Promise<EmailLogStats> {
  const supabase = client || getSupabaseAdminClient();

  const { startDate, endDate } = options;

  let query = supabase
    .from('email_logs')
    .select('status');

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  const logs = (data || []) as { status: string }[];

  const stats: EmailLogStats = {
    total: logs.length,
    sent: 0,
    pending: 0,
    failed: 0,
    bounced: 0,
  };

  for (const log of logs) {
    switch (log.status) {
      case 'sent':
        stats.sent++;
        break;
      case 'pending':
        stats.pending++;
        break;
      case 'failed':
        stats.failed++;
        break;
      case 'bounced':
        stats.bounced++;
        break;
    }
  }

  return stats;
}

// ============================================
// WRITE OPERATIONS (Admin only)
// ============================================

/**
 * Create email template
 */
export async function createEmailTemplate(
  templateData: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<EmailTemplate> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('email_templates')
    .insert(templateData)
    .select()
    .single();

  if (error) throw error;
  return data as EmailTemplate;
}

/**
 * Update email template
 */
export async function updateEmailTemplate(
  templateId: string,
  updates: Partial<Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<EmailTemplate> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('email_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .select()
    .single();

  if (error) throw error;
  return data as EmailTemplate;
}
