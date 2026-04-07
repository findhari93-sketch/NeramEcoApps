export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  createStudentResult,
  generateStudentResultSlug,
} from '@neram/database';
import type { StudentResultExamType } from '@neram/database';

const VALID_EXAM_TYPES: StudentResultExamType[] = ['nata', 'jee_paper2', 'tnea', 'other'];

/**
 * Parse a CSV string into rows of key-value objects.
 * Handles quoted fields with commas inside them.
 */
function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || '').trim();
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, respecting quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

/**
 * POST /api/admin/student-results/bulk-import
 *
 * Import student results from CSV text.
 *
 * Expected CSV columns:
 *   student_name, exam_type, exam_year, score, max_score, rank,
 *   percentile, college_name, college_city, course_name, student_quote
 *
 * All imported records default to is_published=false.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    if (!body.trim()) {
      return NextResponse.json(
        { error: 'Empty CSV data' },
        { status: 400 }
      );
    }

    const rows = parseCSV(body);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows found in CSV. Ensure the file has a header row and at least one data row.' },
        { status: 400 }
      );
    }

    const client = getSupabaseAdminClient();
    const results: { row: number; success: boolean; error?: string; name?: string }[] = [];

    // Track slugs used in this batch to avoid duplicates within the import
    const usedSlugs = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, row 1 is header

      // Validate required fields
      if (!row.student_name) {
        results.push({ row: rowNum, success: false, error: 'Missing student_name' });
        continue;
      }

      const examType = (row.exam_type || 'other').toLowerCase() as StudentResultExamType;
      if (!VALID_EXAM_TYPES.includes(examType)) {
        results.push({
          row: rowNum,
          success: false,
          error: `Invalid exam_type "${row.exam_type}". Must be one of: ${VALID_EXAM_TYPES.join(', ')}`,
          name: row.student_name,
        });
        continue;
      }

      const examYear = parseInt(row.exam_year, 10);
      if (!examYear || isNaN(examYear)) {
        results.push({
          row: rowNum,
          success: false,
          error: 'Missing or invalid exam_year',
          name: row.student_name,
        });
        continue;
      }

      // Generate unique slug
      let baseSlug = generateStudentResultSlug(row.student_name, examType, examYear);
      let slug = baseSlug;
      let suffix = 1;

      while (true) {
        // Check both DB and current batch
        if (usedSlugs.has(slug)) {
          suffix++;
          slug = `${baseSlug}-${suffix}`;
          continue;
        }

        const { data: existing } = await client
          .from('student_results')
          .select('id')
          .eq('slug', slug)
          .limit(1);

        if (!existing || existing.length === 0) {
          break;
        }
        suffix++;
        slug = `${baseSlug}-${suffix}`;
      }

      usedSlugs.add(slug);

      const result = await createStudentResult(
        {
          student_name: row.student_name,
          slug,
          exam_type: examType,
          exam_year: examYear,
          score: row.score ? parseFloat(row.score) : null,
          max_score: row.max_score ? parseFloat(row.max_score) : null,
          rank: row.rank ? parseInt(row.rank, 10) : null,
          percentile: row.percentile ? parseFloat(row.percentile) : null,
          college_name: row.college_name || null,
          college_city: row.college_city || null,
          course_name: row.course_name || null,
          student_quote: row.student_quote || null,
          photo_url: null,
          scorecard_url: null,
          scorecard_watermarked_url: null,
          is_featured: false,
          is_published: false,
          display_order: 0,
        },
        client
      );

      if (result) {
        results.push({ row: rowNum, success: true, name: row.student_name });
      } else {
        results.push({
          row: rowNum,
          success: false,
          error: 'Database insert failed',
          name: row.student_name,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      total: rows.length,
      success: successCount,
      failed: failCount,
      details: results,
    });
  } catch (error) {
    console.error('Error in bulk import:', error);
    return NextResponse.json(
      { error: 'Failed to process bulk import' },
      { status: 500 }
    );
  }
}
