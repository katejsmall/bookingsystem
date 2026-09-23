import "server-only";
import { Resend } from "resend";

/** The only sender identity this app uses for outbound mail. Requires the
 * cj.net domain to be verified in the Resend account behind RESEND_API_KEY. */
const FROM = "CJ 4DPLEX <content.support@cj.net>";

/**
 * Fire-and-log email send: failures are reported to the caller but never
 * thrown, so a missing/invalid RESEND_API_KEY degrades to "the status
 * change saved, the email didn't go out" rather than failing the whole
 * server action.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not configured." };

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send email." };
  }
}
