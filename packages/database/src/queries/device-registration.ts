// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Device Registration Queries
 *
 * Student device registration, usage tracking, and analytics
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  StudentRegisteredDevice,
  StudentRegisteredDeviceInsert,
  DeviceActivityLogInsert,
  DeviceDistributionStats,
  StudentDeviceSummary,
} from '../types';

// ============================================
// STUDENT-FACING QUERIES
// ============================================

/**
 * Register a device for a student
 * Uses upsert to handle re-registration of same fingerprint
 */
export async function registerDevice(
  client: TypedSupabaseClient,
  data: StudentRegisteredDeviceInsert
): Promise<{ device: StudentRegisteredDevice | null; error: string | null }> {
  // Check if category slot is already taken by a different fingerprint
  const { data: existing } = await client
    .from('student_registered_devices')
    .select('id, device_fingerprint')
    .eq('user_id', data.user_id)
    .eq('device_category', data.device_category)
    .eq('is_active', true)
    .single();

  if (existing && existing.device_fingerprint !== data.device_fingerprint) {
    return {
      device: null,
      error: `You already have a ${data.device_category} device registered. Please deregister it first.`,
    };
  }

  // Upsert: update if same fingerprint, insert if new
  const { data: device, error } = await client
    .from('student_registered_devices')
    .upsert(
      {
        ...data,
        is_active: true,
        last_seen_at: new Date().toISOString(),
        session_count: 1,
      },
      { onConflict: 'user_id,device_fingerprint' }
    )
    .select()
    .single();

  if (error) {
    console.error('Failed to register device:', error);
    // Check for unique constraint on category
    if (error.code === '23505') {
      return { device: null, error: 'Device category slot is already taken.' };
    }
    return { device: null, error: 'Failed to register device.' };
  }

  return { device, error: null };
}

/**
 * Get all registered devices for a user
 */
export async function getUserDevices(
  client: TypedSupabaseClient,
  userId: string
): Promise<StudentRegisteredDevice[]> {
  const { data, error } = await client
    .from('student_registered_devices')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('device_category', { ascending: true });

  if (error) {
    console.error('Failed to get user devices:', error);
    return [];
  }
  return data || [];
}

/**
 * Deregister a device
 */
export async function deregisterDevice(
  client: TypedSupabaseClient,
  deviceId: string,
  userId: string
): Promise<boolean> {
  const { error } = await client
    .from('student_registered_devices')
    .update({ is_active: false })
    .eq('id', deviceId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to deregister device:', error);
    return false;
  }
  return true;
}

/**
 * Record a heartbeat: increment active time + update last_seen + location
 */
export async function recordDeviceHeartbeat(
  client: TypedSupabaseClient,
  deviceId: string,
  userId: string,
  activeSeconds: number,
  idleSeconds: number,
  sessionId?: string | null,
  location?: { latitude: number; longitude: number; accuracy: number; city?: string; state?: string; country?: string } | null
): Promise<void> {
  // Update device aggregate stats + location
  const { data: device } = await client
    .from('student_registered_devices')
    .select('total_active_seconds, session_count')
    .eq('id', deviceId)
    .eq('user_id', userId)
    .single();

  if (device) {
    const updateData: Record<string, unknown> = {
      total_active_seconds: (device.total_active_seconds || 0) + activeSeconds,
      last_seen_at: new Date().toISOString(),
    };

    if (location) {
      updateData.last_latitude = location.latitude;
      updateData.last_longitude = location.longitude;
      updateData.last_location_accuracy = location.accuracy;
      if (location.city) updateData.last_city = location.city;
      if (location.state) updateData.last_state = location.state;
      if (location.country) updateData.last_country = location.country;
      updateData.location_consent_given = true;
    }

    await client
      .from('student_registered_devices')
      .update(updateData)
      .eq('id', deviceId)
      .eq('user_id', userId);
  }

  // Insert activity log
  const logData: DeviceActivityLogInsert = {
    user_id: userId,
    device_id: deviceId,
    session_id: sessionId || null,
    active_seconds: activeSeconds,
    idle_seconds: idleSeconds,
    session_date: new Date().toISOString().split('T')[0],
  };

  await client
    .from('device_activity_logs')
    .insert(logData);
}

/**
 * Increment session count for a device
 */
export async function incrementDeviceSessionCount(
  client: TypedSupabaseClient,
  deviceId: string,
  userId: string
): Promise<void> {
  const { data: device } = await client
    .from('student_registered_devices')
    .select('session_count')
    .eq('id', deviceId)
    .eq('user_id', userId)
    .single();

  if (device) {
    await client
      .from('student_registered_devices')
      .update({
        session_count: (device.session_count || 0) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', deviceId)
      .eq('user_id', userId);
  }
}

/**
 * Get daily activity for a device (last N days)
 */
export async function getDeviceDailyActivity(
  client: TypedSupabaseClient,
  deviceId: string,
  days = 30
): Promise<{ date: string; active_seconds: number }[]> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const { data, error } = await client
    .from('device_activity_logs')
    .select('session_date, active_seconds')
    .eq('device_id', deviceId)
    .gte('session_date', sinceDate.toISOString().split('T')[0])
    .order('session_date', { ascending: true });

  if (error) {
    console.error('Failed to get daily activity:', error);
    return [];
  }

  // Aggregate by date
  const byDate: Record<string, number> = {};
  for (const row of data || []) {
    byDate[row.session_date] = (byDate[row.session_date] || 0) + row.active_seconds;
  }

  return Object.entries(byDate).map(([date, active_seconds]) => ({
    date,
    active_seconds,
  }));
}

// ============================================
// ADMIN / TEACHER ANALYTICS QUERIES
// ============================================

/**
 * Get device distribution stats across all students
 */
export async function getDeviceDistributionStats(): Promise<DeviceDistributionStats> {
  const supabase = getSupabaseAdminClient();

  // Get all students
  const { data: students } = await supabase
    .from('users')
    .select('id')
    .eq('user_type', 'student')
    .eq('status', 'active');

  const totalStudents = students?.length || 0;
  const studentIds = students?.map((s) => s.id) || [];

  if (studentIds.length === 0) {
    return { total_students: 0, both_devices: 0, desktop_only: 0, mobile_only: 0, no_devices: 0 };
  }

  // Get all active devices
  const { data: devices } = await supabase
    .from('student_registered_devices')
    .select('user_id, device_category')
    .in('user_id', studentIds)
    .eq('is_active', true);

  // Count per user
  const userDeviceMap: Record<string, Set<string>> = {};
  for (const d of devices || []) {
    if (!userDeviceMap[d.user_id]) userDeviceMap[d.user_id] = new Set();
    userDeviceMap[d.user_id].add(d.device_category);
  }

  let both = 0, desktopOnly = 0, mobileOnly = 0;
  for (const categories of Object.values(userDeviceMap)) {
    const hasDesktop = categories.has('desktop');
    const hasMobile = categories.has('mobile');
    if (hasDesktop && hasMobile) both++;
    else if (hasDesktop) desktopOnly++;
    else if (hasMobile) mobileOnly++;
  }

  return {
    total_students: totalStudents,
    both_devices: both,
    desktop_only: desktopOnly,
    mobile_only: mobileOnly,
    no_devices: totalStudents - Object.keys(userDeviceMap).length,
  };
}

/**
 * Get per-student device summaries for admin/teacher view
 */
export async function getStudentDeviceSummaries(
  options: { limit?: number; offset?: number; search?: string } = {}
): Promise<{ data: StudentDeviceSummary[]; total: number }> {
  const { limit = 50, offset = 0, search } = options;
  const supabase = getSupabaseAdminClient();

  // Get students
  let query = supabase
    .from('users')
    .select('id, name, email, avatar_url', { count: 'exact' })
    .eq('user_type', 'student')
    .eq('status', 'active')
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data: students, count } = await query;

  if (!students || students.length === 0) {
    return { data: [], total: 0 };
  }

  const studentIds = students.map((s) => s.id);

  // Get all devices for these students
  const { data: devices } = await supabase
    .from('student_registered_devices')
    .select('*')
    .in('user_id', studentIds)
    .eq('is_active', true)
    .order('device_category', { ascending: true });

  // Map devices to students
  const devicesByUser: Record<string, StudentRegisteredDevice[]> = {};
  for (const d of devices || []) {
    if (!devicesByUser[d.user_id]) devicesByUser[d.user_id] = [];
    devicesByUser[d.user_id].push(d as StudentRegisteredDevice);
  }

  const summaries: StudentDeviceSummary[] = students.map((s) => {
    const userDevices = devicesByUser[s.id] || [];
    const hasDesktop = userDevices.some((d) => d.device_category === 'desktop');
    const hasMobile = userDevices.some((d) => d.device_category === 'mobile');
    const totalTime = userDevices.reduce((sum, d) => sum + (d.total_active_seconds || 0), 0);
    const lastActive = userDevices.length > 0
      ? userDevices.reduce((latest, d) =>
          d.last_seen_at > latest ? d.last_seen_at : latest, userDevices[0].last_seen_at)
      : null;

    let deviceStatus: StudentDeviceSummary['device_status'] = 'none';
    if (hasDesktop && hasMobile) deviceStatus = 'both';
    else if (hasDesktop) deviceStatus = 'desktop_only';
    else if (hasMobile) deviceStatus = 'mobile_only';

    return {
      user_id: s.id,
      user_name: s.name,
      user_email: s.email,
      user_avatar: s.avatar_url,
      devices: userDevices,
      total_active_time: totalTime,
      last_active: lastActive,
      device_status: deviceStatus,
    };
  });

  return { data: summaries, total: count || 0 };
}

/**
 * Get a single student's device details (for admin/teacher)
 */
export async function getStudentDeviceDetail(
  userId: string
): Promise<StudentDeviceSummary | null> {
  const supabase = getSupabaseAdminClient();

  const { data: student } = await supabase
    .from('users')
    .select('id, name, email, avatar_url')
    .eq('id', userId)
    .single();

  if (!student) return null;

  const { data: devices } = await supabase
    .from('student_registered_devices')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  const userDevices = (devices || []) as StudentRegisteredDevice[];
  const hasDesktop = userDevices.some((d) => d.device_category === 'desktop');
  const hasMobile = userDevices.some((d) => d.device_category === 'mobile');
  const totalTime = userDevices.reduce((sum, d) => sum + (d.total_active_seconds || 0), 0);
  const lastActive = userDevices.length > 0
    ? userDevices.reduce((latest, d) =>
        d.last_seen_at > latest ? d.last_seen_at : latest, userDevices[0].last_seen_at)
    : null;

  let deviceStatus: StudentDeviceSummary['device_status'] = 'none';
  if (hasDesktop && hasMobile) deviceStatus = 'both';
  else if (hasDesktop) deviceStatus = 'desktop_only';
  else if (hasMobile) deviceStatus = 'mobile_only';

  return {
    user_id: student.id,
    user_name: student.name,
    user_email: student.email,
    user_avatar: student.avatar_url,
    devices: userDevices,
    total_active_time: totalTime,
    last_active: lastActive,
    device_status: deviceStatus,
  };
}
