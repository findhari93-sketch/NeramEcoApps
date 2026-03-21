import { getSupabaseAdminClient } from '../../client';
import type {
  NexusDocumentTemplate,
  NexusStudentDocument,
  NexusStudentExamPlan,
  NexusDocumentAuditLog,
  DocumentStandard,
  DocumentStatus,
  ExamPlanType,
  ExamPlanState,
  DocumentAuditAction,
} from '../../types';

// Cast to 'any' — document vault tables are not in generated Supabase types yet
const supabase = (): any => getSupabaseAdminClient();

// ============================================
// TEMPLATES
// ============================================

export async function getDocumentTemplates(
  options?: { standard?: DocumentStandard; activeOnly?: boolean }
): Promise<NexusDocumentTemplate[]> {
  let query = supabase().from('nexus_document_templates').select('*');

  if (options?.activeOnly !== false) {
    query = query.eq('is_active', true);
  }

  if (options?.standard) {
    query = query.contains('applicable_standards', [options.standard]);
  }

  const { data, error } = await query.order('sort_order').order('name');
  if (error) throw error;
  return (data || []) as NexusDocumentTemplate[];
}

export async function getDocumentTemplateById(id: string): Promise<NexusDocumentTemplate | null> {
  const { data, error } = await supabase()
    .from('nexus_document_templates')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as NexusDocumentTemplate;
}

export async function createDocumentTemplate(
  template: Omit<NexusDocumentTemplate, 'id' | 'created_at' | 'updated_at'>
): Promise<NexusDocumentTemplate> {
  const { data, error } = await supabase()
    .from('nexus_document_templates')
    .insert(template)
    .select()
    .single();
  if (error) throw error;
  return data as NexusDocumentTemplate;
}

export async function updateDocumentTemplate(
  id: string,
  updates: Partial<NexusDocumentTemplate>
): Promise<NexusDocumentTemplate> {
  const { data, error } = await supabase()
    .from('nexus_document_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as NexusDocumentTemplate;
}

// ============================================
// STUDENT DOCUMENTS
// ============================================

export async function getStudentDocuments(
  studentId: string,
  classroomId: string,
  options?: { includeDeleted?: boolean; templateId?: string; status?: DocumentStatus }
): Promise<NexusStudentDocument[]> {
  let query = supabase()
    .from('nexus_student_documents')
    .select('*')
    .eq('student_id', studentId)
    .eq('classroom_id', classroomId)
    .eq('is_current', true);

  if (!options?.includeDeleted) {
    query = query.eq('is_deleted', false);
  }

  if (options?.templateId) {
    query = query.eq('template_id', options.templateId);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query.order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data || []) as NexusStudentDocument[];
}

export async function getDocumentById(id: string): Promise<NexusStudentDocument | null> {
  const { data, error } = await supabase()
    .from('nexus_student_documents')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as NexusStudentDocument;
}

export async function getDocumentVersionHistory(documentId: string): Promise<NexusStudentDocument[]> {
  // Walk back through previous_version_id chain
  const versions: NexusStudentDocument[] = [];
  let currentId: string | null = documentId;

  while (currentId) {
    const doc = await getDocumentById(currentId);
    if (!doc) break;
    versions.push(doc);
    currentId = doc.previous_version_id;
  }

  return versions;
}

interface ClassroomDocumentOverview {
  students: Array<{ id: string; name: string; email: string; avatar_url: string | null; current_standard: string | null }>;
  templates: NexusDocumentTemplate[];
  matrix: Record<string, Record<string, { status: DocumentStatus; document_id: string } | null>>;
}

export async function getClassroomDocumentOverview(classroomId: string): Promise<ClassroomDocumentOverview> {
  // Get enrolled students
  const { data: enrollments, error: enrollErr } = await supabase()
    .from('nexus_enrollments')
    .select('user_id, current_standard, users:user_id(id, name, email, avatar_url)')
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);
  if (enrollErr) throw enrollErr;

  // Get active templates
  const templates = await getDocumentTemplates({ activeOnly: true });

  // Get all current, non-deleted documents for this classroom
  const { data: docs, error: docsErr } = await supabase()
    .from('nexus_student_documents')
    .select('id, student_id, template_id, status')
    .eq('classroom_id', classroomId)
    .eq('is_current', true)
    .eq('is_deleted', false);
  if (docsErr) throw docsErr;

  // Build matrix
  const matrix: Record<string, Record<string, { status: DocumentStatus; document_id: string } | null>> = {};
  const students: ClassroomDocumentOverview['students'] = [];

  for (const enrollment of (enrollments || [])) {
    const user = enrollment.users as unknown as { id: string; name: string; email: string; avatar_url: string | null };
    if (!user) continue;
    students.push({ ...user, current_standard: (enrollment as Record<string, unknown>).current_standard as string | null });
    matrix[user.id] = {};
    for (const tmpl of templates) {
      const doc = (docs || []).find(
        (d: Record<string, unknown>) => d.student_id === user.id && d.template_id === tmpl.id
      );
      matrix[user.id][tmpl.id] = doc
        ? { status: doc.status as DocumentStatus, document_id: doc.id as string }
        : null;
    }
  }

  return { students, templates, matrix };
}

// ============================================
// EXAM PLANS
// ============================================

export async function getStudentExamPlans(
  studentId: string,
  classroomId: string
): Promise<NexusStudentExamPlan[]> {
  const { data, error } = await supabase()
    .from('nexus_student_exam_plans')
    .select('*')
    .eq('student_id', studentId)
    .eq('classroom_id', classroomId);
  if (error) throw error;
  return (data || []) as NexusStudentExamPlan[];
}

export async function upsertExamPlan(
  studentId: string,
  classroomId: string,
  examType: ExamPlanType,
  state: ExamPlanState,
  applicationNumber?: string | null,
  notes?: string | null
): Promise<NexusStudentExamPlan> {
  const { data, error } = await supabase()
    .from('nexus_student_exam_plans')
    .upsert(
      {
        student_id: studentId,
        classroom_id: classroomId,
        exam_type: examType,
        state,
        application_number: applicationNumber ?? null,
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,classroom_id,exam_type' }
    )
    .select()
    .single();
  if (error) throw error;
  return data as NexusStudentExamPlan;
}

// ============================================
// AUDIT LOG
// ============================================

export async function createDocumentAuditEntry(entry: {
  document_id?: string | null;
  student_id: string;
  classroom_id: string;
  action: DocumentAuditAction;
  performed_by: string;
  metadata?: Record<string, unknown>;
}): Promise<NexusDocumentAuditLog> {
  const { data, error } = await supabase()
    .from('nexus_document_audit_log')
    .insert({
      document_id: entry.document_id ?? null,
      student_id: entry.student_id,
      classroom_id: entry.classroom_id,
      action: entry.action,
      performed_by: entry.performed_by,
      metadata: entry.metadata || {},
    })
    .select()
    .single();
  if (error) throw error;
  return data as NexusDocumentAuditLog;
}

export async function getDocumentAuditLog(
  options: { documentId?: string; studentId?: string; classroomId?: string; limit?: number }
): Promise<(NexusDocumentAuditLog & { performer?: { name: string } })[]> {
  let query = supabase()
    .from('nexus_document_audit_log')
    .select('*, performer:performed_by(name)');

  if (options.documentId) {
    query = query.eq('document_id', options.documentId);
  }
  if (options.studentId) {
    query = query.eq('student_id', options.studentId);
  }
  if (options.classroomId) {
    query = query.eq('classroom_id', options.classroomId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(options.limit || 100);
  if (error) throw error;
  return (data || []) as (NexusDocumentAuditLog & { performer?: { name: string } })[];
}
