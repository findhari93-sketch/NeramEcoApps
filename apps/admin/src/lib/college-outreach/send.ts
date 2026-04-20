import { Resend } from 'resend';

let client: Resend | null = null;

function getResend(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    client = new Resend(key);
  }
  return client;
}

export interface SendOutreachArgs {
  to: string;
  bcc?: string | null;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
}

export interface SendOutreachResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const DEFAULT_FROM = 'Neram Classes <info@neramclasses.com>';

export async function sendOutreachEmail(args: SendOutreachArgs): Promise<SendOutreachResult> {
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: args.from || DEFAULT_FROM,
      to: args.to,
      bcc: args.bcc || undefined,
      subject: args.subject,
      html: args.html,
      text: args.text,
      reply_to: args.replyTo,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, messageId: data?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
