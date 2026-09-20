import type { IncomingMessage, ServerResponse } from 'http';
import nodemailer from 'nodemailer';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SendEmailRequest {
  to: string;
  subject: string;
  text?: string;
  html: string;
  meta?: Record<string, unknown>;
}

interface ValidationError {
  field: string;
  message: string;
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validate(body: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!body || typeof body !== 'object') {
    errors.push({ field: 'body', message: 'Request body must be a JSON object' });
    return errors;
  }
  const req = body as Record<string, unknown>;
  if (!req.to || typeof req.to !== 'string') {
    errors.push({ field: 'to', message: 'Missing required field: to' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.to)) {
    errors.push({ field: 'to', message: 'Invalid email address format' });
  }
  if (!req.subject || typeof req.subject !== 'string' || !req.subject.trim()) {
    errors.push({ field: 'subject', message: 'Missing or empty subject' });
  }
  if (!req.html || typeof req.html !== 'string' || !req.html.trim()) {
    errors.push({ field: 'html', message: 'Missing or empty html body' });
  }
  return errors;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

function verifyApiKey(req: IncomingMessage): boolean {
  const apiKey = process.env.EMAIL_API_KEY;
  if (!apiKey) {
    console.error('EMAIL_API_KEY env var not set');
    return false;
  }
  const provided = req.headers['x-api-key'];
  if (!provided || Array.isArray(provided)) return false;
  if (provided.length !== apiKey.length) return false;
  let result = 0;
  for (let i = 0; i < provided.length; i++) {
    result |= provided.charCodeAt(i) ^ apiKey.charCodeAt(i);
  }
  return result === 0;
}

// ─── Transporter (cached across warm invocations) ───────────────────────────

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
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

// ─── Helper: read JSON body ─────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Method not allowed', error: { code: 'METHOD_NOT_ALLOWED', description: 'Only POST requests are accepted' } }));
    return;
  }

  // Auth
  if (!verifyApiKey(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Authentication failed', error: { code: 'UNAUTHORIZED', description: 'Missing or invalid x-api-key header' } }));
    return;
  }

  // Parse body
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Invalid JSON body', error: { code: 'INVALID_JSON', description: 'Request body must be valid JSON' } }));
    return;
  }

  // Validate
  const errors = validate(body);
  if (errors.length > 0) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Validation failed', error: { code: 'VALIDATION_ERROR', description: errors.map((e) => `${e.field}: ${e.message}`).join('; ') } }));
    return;
  }

  const { to, subject, text, html, meta } = body as SendEmailRequest;

  // Send
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER || '"Gobadi App" <no-reply@gobadi.com>',
      to,
      subject,
      text: text || subject,
      html,
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      message: 'Email delivered successfully',
      data: { recipient: to, subject, messageId: info.messageId || 'unknown', timestamp: new Date().toISOString(), ...(meta ? { meta } : {}) },
    }));
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error(`Email send failed to ${to}:`, err.message);

    let errorCode = 'SMTP_ERROR';
    let errorDesc = err.message || 'Unknown error occurred';
    if (err.code === 'EAUTH') { errorCode = 'SMTP_AUTH_FAILED'; errorDesc = 'Gmail app password invalid. Regenerate in Google Account > Security > App passwords.'; }
    else if (err.code === 'ECONNREFUSED') { errorCode = 'SMTP_CONNECTION_REFUSED'; errorDesc = 'Could not connect to Gmail SMTP server'; }
    else if (err.code === 'ETIMEDOUT') { errorCode = 'SMTP_TIMEOUT'; errorDesc = 'Connection to Gmail SMTP server timed out'; }
    else if (err.code === 'EENVELOPE') { errorCode = 'INVALID_ENVELOPE'; errorDesc = `Invalid recipient address: ${to}`; }

    res.statusCode = errorCode === 'SMTP_AUTH_FAILED' ? 401 : 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      message: 'Email delivery failed',
      error: { code: errorCode, description: errorDesc },
      data: { recipient: to, subject, timestamp: new Date().toISOString(), ...(meta ? { meta } : {}) },
    }));
  }
}
