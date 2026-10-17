/**
 * Words for fee states, shared by the Application and fees form, the CRM and
 * Collections. Status is always said in words, never by colour alone.
 */

export function checkStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'queued':
      return 'Waiting to send';
    case 'sent':
      return 'Sent';
    case 'opened':
      return 'Opened';
    case 'confirmed':
      return 'Confirmed';
    case 'changed':
      return 'Changed after they confirmed';
    case 'correction_reported':
      return 'Reported a problem';
    default:
      return 'Not sent';
  }
}

export type ChipColor = 'default' | 'success' | 'warning' | 'error' | 'info';

export function checkStatusColor(status: string | null | undefined): ChipColor {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'correction_reported':
    case 'changed':
      return 'warning';
    case 'sent':
    case 'opened':
      return 'info';
    default:
      return 'default';
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Due in 3 days", "Due today", "Overdue 5 days", "No date set", "Paid", "No fee set". */
export function collectionStatusWords(status: string, daysUntilDue: number | null): string {
  switch (status) {
    case 'missing_fee':
      return 'No fee set';
    case 'paid':
      return 'Paid';
    case 'no_date':
      return 'No date set';
    case 'due_today':
      return 'Due today';
    case 'overdue':
      return `Overdue ${plural(Math.abs(daysUntilDue ?? 0), 'day', 'days')}`;
    case 'due_soon':
    case 'due_later':
      return daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${plural(daysUntilDue ?? 0, 'day', 'days')}`;
    default:
      return status;
  }
}

export function collectionStatusColor(status: string): ChipColor {
  switch (status) {
    case 'overdue':
      return 'error';
    case 'due_today':
    case 'due_soon':
      return 'warning';
    case 'paid':
      return 'success';
    case 'missing_fee':
    case 'no_date':
      return 'default';
    default:
      return 'info';
  }
}

export function planLabel(plan: string | null | undefined): string {
  if (plan === 'installment') return 'Two installments';
  if (plan === 'full') return 'Paid in full';
  return 'Not set';
}
