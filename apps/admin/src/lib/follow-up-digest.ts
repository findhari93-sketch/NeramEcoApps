import {
  getSupabaseAdminClient,
  createAdminNotification,
  sendTelegramMessage,
  sendEmail,
  sweepDemoFollowUps,
  resolveDemoSettings,
  buildOwnerDigest,
  buildManagerSummary,
  istDateKey,
  type DigestRow,
} from '@neram/database';

const DAY = 86_400_000;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Queue a Teams message once per dedupe key. True when this call queued it. */
async function queueTeams(sb: any, toUserId: string, kind: string, key: string, msg: { subject: string; plain: string; link: string }): Promise<boolean> {
  const { data } = await sb
    .from('staff_digest_messages')
    .upsert(
      { to_user_id: toUserId, kind, dedupe_key: key, subject: msg.subject, plain: msg.plain, link: msg.link },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .select('id');
  return (data || []).length > 0;
}

/** 09:00 IST: sweep, then one digest per owner and a team summary for the manager. */
export async function runFollowUpDigest(now: Date, adminOrigin: string) {
  const sb: any = getSupabaseAdminClient();
  const swept = await sweepDemoFollowUps(now, sb);
  const endOfToday = new Date(new Date(`${istDateKey(now)}T00:00:00+05:30`).getTime() + DAY).toISOString();
  const { data: due } = await sb.from('crm_follow_ups').select('*').lt('due_at', endOfToday).limit(1000);
  const rows: DigestRow[] = (due || []).map((r: any) => ({
    callback_id: r.callback_id,
    user_id: r.user_id,
    person_name: r.person_name,
    person_phone: r.person_phone,
    due_at: r.due_at,
    interest_level: r.interest_level,
    owner_id: r.assigned_to || r.crm_owner_id,
    query_type: r.query_type,
    flags: r.flags,
  }));
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id).filter(Boolean))) as string[];
  const { data: settingsRow } = await sb.from('site_settings').select('value').eq('key', 'demo_class').maybeSingle();
  const settings = resolveDemoSettings(settingsRow?.value);
  const { data: people } = await sb
    .from('users')
    .select('id, name, email')
    .or([ownerIds.length ? `id.in.(${ownerIds.join(',')})` : null, settings.followUpManagerUpn ? `email.ilike.${settings.followUpManagerUpn}` : null].filter(Boolean).join(',') || 'id.is.null');
  const byId: Record<string, { name: string; email: string | null }> = {};
  for (const p of people || []) byId[p.id] = { name: p.name, email: p.email };
  const day = istDateKey(now);

  for (const ownerId of ownerIds) {
    const mine = rows.filter((r) => r.owner_id === ownerId);
    const d = buildOwnerDigest(mine, now, adminOrigin);
    for (const r of mine) {
      await createAdminNotification(
        { event_type: 'callback_reminder', title: `Follow up: ${r.person_name || r.person_phone}`, message: d.subject, metadata: { user_id: r.user_id, callback_id: r.callback_id, owner_id: ownerId, link: `${adminOrigin}/crm/${r.user_id}` } },
        sb,
      ).catch(() => {});
    }
    const who = byId[ownerId]?.name || 'Staff';
    await sendTelegramMessage(`<b>${escapeHtml(who)}: ${escapeHtml(d.subject)}</b>\n${escapeHtml(d.plain.split('\n').slice(1).join('\n'))}\n${d.link}`).catch(() => {});
    if (byId[ownerId]?.email) {
      await sendEmail({ to: byId[ownerId].email!, subject: `Neram follow-ups: ${d.subject}`, html: `<p>${d.plain.split('\n').map(escapeHtml).join('<br>')}</p><p><a href="${d.link}">Open Follow-ups</a></p>` }).catch(() => {});
    }
    await queueTeams(sb, ownerId, 'follow_up_digest', `digest:${ownerId}:${day}`, d);
  }

  const manager = (people || []).find((p: any) => p.email && settings.followUpManagerUpn && p.email.toLowerCase() === settings.followUpManagerUpn);
  if (manager) {
    const since = new Date(new Date(`${day}T00:00:00+05:30`).getTime() - DAY).toISOString();
    const { data: done } = await sb.from('callback_attempts').select('admin_id').gte('attempted_at', since).lt('attempted_at', new Date(`${day}T00:00:00+05:30`).toISOString());
    const doneYesterday: Record<string, number> = {};
    for (const a of done || []) doneYesterday[a.admin_id] = (doneYesterday[a.admin_id] || 0) + 1;
    const names: Record<string, string> = Object.fromEntries(ownerIds.map((id) => [id, byId[id]?.name || 'Staff']));
    const s = buildManagerSummary(rows, doneYesterday, names, now, adminOrigin);
    await sendTelegramMessage(`<b>${escapeHtml(s.subject)}</b>\n${escapeHtml(s.plain.split('\n').slice(1).join('\n'))}\n${s.link}`).catch(() => {});
    if (manager.email) await sendEmail({ to: manager.email, subject: s.subject, html: `<p>${s.plain.split('\n').map(escapeHtml).join('<br>')}</p><p><a href="${s.link}">Open Follow-ups</a></p>` }).catch(() => {});
    await queueTeams(sb, manager.id, 'follow_up_manager', `manager:${manager.id}:${day}`, s);
  }
  return { owners: ownerIds.length, items: rows.length, swept };
}

/** Every 5 minutes: follow-ups with a time in the next 15 minutes get a Teams nudge (once). */
export async function queueFollowUpNudges(now: Date, adminOrigin: string): Promise<number> {
  const sb: any = getSupabaseAdminClient();
  const { data } = await sb
    .from('crm_follow_ups')
    .select('callback_id, user_id, person_name, person_phone, due_at, assigned_to, crm_owner_id')
    .gte('due_at', now.toISOString())
    .lt('due_at', new Date(now.getTime() + 15 * 60_000).toISOString());
  let queued = 0;
  for (const r of data || []) {
    const to = r.assigned_to || r.crm_owner_id;
    if (!to) continue;
    const name = r.person_name || r.person_phone || 'a student';
    const msg = {
      subject: `Call ${name} in 15 minutes`,
      plain: `Follow-up with ${name} is due at ${new Date(r.due_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}.`,
      link: `${adminOrigin}/crm/${r.user_id}`,
    };
    // The bell item rides on the Teams dedupe, so each follow-up time nudges once.
    if (await queueTeams(sb, to, 'follow_up_soon', `soon:${r.callback_id}:${r.due_at}`, msg)) {
      await createAdminNotification(
        { event_type: 'callback_reminder', title: msg.subject, message: msg.plain, metadata: { user_id: r.user_id, callback_id: r.callback_id, owner_id: to, link: msg.link } },
        sb,
      ).catch(() => {});
      queued++;
    }
  }
  return queued;
}
