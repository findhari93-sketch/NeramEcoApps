/**
 * Did this student start the plain recording of a class before its guided recap
 * went live?
 *
 * NXS-0123. A class with no recap plays its plain recording on the catch-up
 * screen, and pressing Watch there queues the recap at the front of the sweep.
 * The sweep runs every fifteen minutes, so the recap can go live partway through
 * that same watch. The stream route then refused the next ten minute renewal, the
 * video blanked forty minutes in, and "I have watched it" was refused too, so the
 * student had to start again from 0:00 behind checkpoints.
 *
 * A student in that position finishes the way they started. The evidence is the
 * grant log, not anything the client says: every plain-recording stream a student
 * is handed writes a `nexus_class_recap_stream_grants` row with `recap_id` null
 * (the guided player's grants carry the recap id), so a plain grant issued before
 * `published_at` proves they began before the guided version existed.
 *
 * Fails closed. No publish time, no grant, or a read error all answer false,
 * which is the behaviour before this existed: the guided recap. Grants are only
 * written while `student.protected-video` is on, which is its default.
 */
export async function startedPlainBeforeRecap(
  supabase: any,
  args: { studentId: string; classId: string; recapId: string },
): Promise<boolean> {
  try {
    const { data: recap, error: recapError } = await supabase
      .from('nexus_class_recaps')
      .select('published_at')
      .eq('id', args.recapId)
      .maybeSingle();
    if (recapError || !recap?.published_at) return false;

    const { data: grants, error: grantError } = await supabase
      .from('nexus_class_recap_stream_grants')
      .select('issued_at')
      .eq('student_id', args.studentId)
      .eq('scheduled_class_id', args.classId)
      .is('recap_id', null)
      .lt('issued_at', recap.published_at)
      .limit(1);
    if (grantError) return false;
    return (grants || []).length > 0;
  } catch {
    return false;
  }
}
