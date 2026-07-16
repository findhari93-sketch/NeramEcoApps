import { NextRequest, NextResponse } from 'next/server';
import {
  getAssignment,
  createFileRecord,
  getNextSortOrder,
  addAssignmentAttachments,
  getAssignmentDetail,
  ASSIGNMENT_ATTACHMENTS_FOLDER_ID,
} from '@neram/database';
import { getRequestUser, isStaff } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { resolveShareUrlToItem } from '@/lib/sharepoint';

/**
 * POST /api/assignments/link-document  (staff)
 * Attach an EXISTING OneDrive/SharePoint document to an assignment by pasting its
 * share link, instead of re-uploading the bytes. We resolve the link to a Graph
 * driveItem, record it as a linked nexus_study_files row (link_url set, no upload),
 * and add it as an assignment attachment. Students later stream it view-only through
 * the study-materials content route, which resolves link_url on demand.
 *
 * Body: { assignment_id, url, title? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (!isStaff(user)) throw new ApiError('Not authorized', 403);

    const body = await request.json();
    const assignmentId = String(body?.assignment_id || '').trim();
    const url = String(body?.url || '').trim();
    if (!assignmentId) throw new ApiError('assignment_id is required', 400);
    if (!/^https?:\/\//i.test(url)) throw new ApiError('Paste a valid OneDrive/SharePoint link.', 400);

    const assignment = await getAssignment(assignmentId);
    if (!assignment) throw new ApiError('Assignment not found', 404);

    const item = await resolveShareUrlToItem(url);

    const sortOrder = await getNextSortOrder({ files: ASSIGNMENT_ATTACHMENTS_FOLDER_ID });
    const record = await createFileRecord({
      folder_id: ASSIGNMENT_ATTACHMENTS_FOLDER_ID,
      title: String(body?.title || '').trim() || item.name.replace(/\.[^.]+$/, ''),
      file_name: item.name,
      file_type: item.mimeType,
      file_size_bytes: item.size,
      sharepoint_item_id: item.id,
      sharepoint_web_url: url,
      link_url: url,
      sort_order: sortOrder,
      uploaded_by: user.id,
    });

    await addAssignmentAttachments(assignmentId, [{ study_file_id: record.id }]);
    const detail = await getAssignmentDetail(assignmentId);
    return NextResponse.json({ assignment: detail, file: record });
  } catch (err) {
    return errorResponse(err, 'Could not link the document');
  }
}
