import { getSupabaseAdminClient, createAdminClientISR } from '../client';
import type { AskSeniorsEvent, AskSeniorsCollege, AskSeniorsRegistrationPayload } from '../types';

const ASK_SENIORS_COLLEGE_SLUGS = [
  'anna-university-architecture',
  'nit-trichy-architecture',
  'psg-college-architecture',
  'spa-delhi-architecture',
  'cept-university-architecture',
  'measi-academy-architecture',
  'ms-ramaiah-architecture',
  'dayananda-sagar-architecture',
  'spa-bhopal-architecture',
  'thiagarajar-college-architecture',
  'rathinam-college-architecture',
  'karpagam-academy-architecture',
  'vnit-nagpur-architecture',
  'spa-vijayawada-architecture',
  'mcgans-ooty-architecture',
  'prime-nagapattinam-architecture',
  'periyar-university-architecture',
  'papni-architecture',
  'srm-architecture',
  'vit-vellore-architecture',
  'christ-university-architecture',
];

export async function getActiveAskSeniorsEvent(): Promise<AskSeniorsEvent | null> {
  const supabase = createAdminClientISR(3600);
  const { data, error } = await supabase
    .from('ask_seniors_events')
    .select('*')
    .in('status', ['upcoming', 'active'])
    .order('year', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as AskSeniorsEvent;
}

export async function getAskSeniorsColleges(): Promise<AskSeniorsCollege[]> {
  const supabase = createAdminClientISR(3600);
  const { data, error } = await supabase
    .from('colleges')
    .select('id, slug, state_slug, name, short_name, city, logo_url')
    .in('slug', ASK_SENIORS_COLLEGE_SLUGS)
    .order('state_slug');

  if (error || !data) return [];
  return data as AskSeniorsCollege[];
}

export async function registerForAskSeniors(
  payload: AskSeniorsRegistrationPayload
): Promise<{ id: string }> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('ask_seniors_registrations')
    .insert(payload)
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data as { id: string };
}
