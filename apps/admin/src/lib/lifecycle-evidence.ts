/**
 * Turn a lifecycle suggestion's `evidence` JSON (written by
 * generate_lifecycle_suggestions) into short label / value lines for the queue.
 * Label maps are passed in so this stays a pure function.
 */
import { formatIstDate, agoText } from './ops-format';

export interface EvidenceLabels {
  stages?: Record<string, string>;
  crmStages?: Record<string, string>;
  activitySources?: Record<string, string>;
}

export interface EvidenceLine {
  label: string;
  value: string;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function evidenceLines(
  evidence: Record<string, unknown> | null | undefined,
  labels: EvidenceLabels = {},
  now: Date = new Date(),
): EvidenceLine[] {
  const e = evidence || {};
  const lines: EvidenceLine[] = [];

  if ('last_activity_at' in e) {
    const at = str(e.last_activity_at);
    lines.push({
      label: 'Last active',
      value: at ? `${formatIstDate(at)} (${agoText(at, now)})` : 'No activity recorded',
    });
  }
  const source = str(e.last_activity);
  if (source) lines.push({ label: 'Last activity', value: labels.activitySources?.[source] || source.replace(/_/g, ' ') });

  const classroom = str(e.classroom);
  if (classroom) lines.push({ label: 'Classroom', value: classroom });

  const stage = str(e.stage);
  if (stage) lines.push({ label: 'Stage', value: labels.stages?.[stage] || stage.replace(/_/g, ' ') });

  const crmStage = str(e.crm_stage);
  if (crmStage) lines.push({ label: 'CRM stage', value: labels.crmStages?.[crmStage] || crmStage.replace(/_/g, ' ') });

  const archivedAt = str(e.archived_at);
  if (archivedAt) lines.push({ label: 'Archived', value: `${formatIstDate(archivedAt)} (${agoText(archivedAt, now)})` });

  const year = str(e.academic_year);
  const current = str(e.current_batch);
  if (year) lines.push({ label: 'Batch', value: current ? `${year} (current is ${current})` : year });

  return lines;
}
