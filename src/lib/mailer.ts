/**
 * Minimal outbound mailer for Fleet Hub operational notifications.
 *
 * Uses the shared 1PWR transactional account (noreply@1pwrafrica.com) over
 * SMTP — the same sender the HR portal uses, so approvers see a familiar
 * address. Configured via environment (server .env on EC2):
 *
 *   FM_SMTP_HOST      e.g. ded4738.inmotionhosting.com
 *   FM_SMTP_PORT      587 (STARTTLS) or 465 (implicit TLS)
 *   FM_SMTP_USER      noreply@1pwrafrica.com
 *   FM_SMTP_PASSWORD  account password
 *   FM_SMTP_FROM      optional override, defaults to FM_SMTP_USER
 *
 * Notifications are best-effort: sendMail never throws; callers record the
 * outcome in the mutation log so "was anyone notified?" is auditable.
 */
import nodemailer from "nodemailer";

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export type MailResult = { ok: true } | { ok: false; error: string };

export function mailerConfigured(): boolean {
  return Boolean(
    (process.env.FM_SMTP_HOST || "").trim() &&
      (process.env.FM_SMTP_USER || "").trim() &&
      (process.env.FM_SMTP_PASSWORD || "").trim(),
  );
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!mailerConfigured()) {
    return { ok: false, error: "FM_SMTP_* not configured" };
  }
  const to = [...new Set(message.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (to.length === 0) {
    return { ok: false, error: "no recipients" };
  }
  const port = Number(process.env.FM_SMTP_PORT || "587");
  const from = (process.env.FM_SMTP_FROM || process.env.FM_SMTP_USER || "").trim();
  try {
    const transport = nodemailer.createTransport({
      host: (process.env.FM_SMTP_HOST || "").trim(),
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: {
        user: (process.env.FM_SMTP_USER || "").trim(),
        pass: process.env.FM_SMTP_PASSWORD || "",
      },
      connectionTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({
      from: `"1PWR Fleet Hub" <${from}>`,
      to: to.join(", "),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
