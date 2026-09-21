import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SendPdfEmailOptions {
  to: string;
  patientName: string;
  pdfBuffer: Buffer;
  filename?: string;
}

// ─── Brand Colors ───────────────────────────────────────────────────────────

const BRAND = {
  primary: '#BD632F',
  primaryDark: '#9C4E22',
  text: '#1A1817',
  textMuted: '#7C7672',
  textFaint: '#9C9690',
  border: '#E6E1DC',
  background: '#FAF9F6',
  surface: '#FFFFFF',
};

// ─── Transporter (cached across warm invocations) ───────────────────────────

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASS;

  if (!gmailUser || !gmailPass) {
    throw new Error('Gmail credentials missing. Set GMAIL_USER and GMAIL_APP_PASS.');
  }

  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  return cachedTransporter;
}

// ─── Send ───────────────────────────────────────────────────────────────────

export async function sendPdfEmail(options: SendPdfEmailOptions): Promise<{ messageId: string }> {
  const { to, patientName, pdfBuffer, filename } = options;
  const attachmentName = filename || `Prescription_${patientName.replace(/\s+/g, '_')}.pdf`;

  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: `"GoVadi Health" <${process.env.GMAIL_USER || 'no-reply@gobadi.com'}>`,
    to,
    subject: `Your Prescription from GoVadi — ${patientName}`,
    text: `Dear ${patientName},\n\nPlease find your prescription attached as a PDF.\n\nIf you have any questions, please contact your healthcare provider.\n\nBest regards,\nGoVadi Health Services`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: ${BRAND.background}; font-family: Arial, Helvetica, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.background}; padding: 32px 0;">
          <tr>
            <td align="center">
              <table width="480" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.surface}; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">

                <!-- Header -->
                <tr>
                  <td style="background-color: ${BRAND.primary}; padding: 32px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">GoVadi</h1>
                    <p style="margin: 4px 0 0; color: rgba(255,255,255,0.85); font-size: 13px; font-weight: 400;">Veterinary Health Services</p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 8px; color: ${BRAND.text}; font-size: 20px; font-weight: 700;">Your Prescription</h2>
                    <p style="margin: 0 0 24px; color: ${BRAND.textMuted}; font-size: 14px; line-height: 1.5;">
                      Dear <strong style="color: ${BRAND.text};">${patientName}</strong>,
                    </p>
                    <p style="margin: 0 0 24px; color: ${BRAND.textMuted}; font-size: 14px; line-height: 1.5;">
                      Your prescription document is attached as a PDF file. Please review the medication details and follow the instructions provided by your doctor.
                    </p>

                    <!-- Info Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.background}; border-radius: 12px; border: 1px solid ${BRAND.border}; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <p style="margin: 0; color: ${BRAND.textMuted}; font-size: 13px; line-height: 1.6;">
                            📎 Prescription PDF is attached to this email<br>
                            💊 Please follow the dosage instructions carefully<br>
                            📞 Contact your doctor if you have any questions
                          </p>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0; color: ${BRAND.textMuted}; font-size: 14px; line-height: 1.5;">
                      If you have any questions about your prescription, please contact your healthcare provider.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 0 40px 40px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-top: 1px solid ${BRAND.border}; padding-top: 24px;">
                          <p style="margin: 0; color: ${BRAND.textFaint || '#9C9690'}; font-size: 12px; text-align: center; line-height: 1.5;">
                            Best regards,<br>
                            <strong style="color: ${BRAND.primary};">GoVadi Health Services</strong><br>
                            <span style="font-size: 11px;">Veterinary Care Platform</span>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    attachments: [
      {
        filename: attachmentName,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  return { messageId: info.messageId || 'unknown' };
}
