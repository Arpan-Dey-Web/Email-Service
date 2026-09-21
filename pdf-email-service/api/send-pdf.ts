import type { IncomingMessage, ServerResponse } from 'http';
import { generatePrescriptionPdf } from '../lib/pdf-generator';
import { sendPdfEmail } from '../lib/mailer';
import { verifyServiceSecret } from '../lib/auth';
import { checkRateLimit } from '../lib/rate-limiter';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Medication {
  name: string;
  type?: string;
  dosage?: string;
  dosageUnit?: string;
  frequency?: string;
  duration?: string;
  durationUnit?: string;
  quantity?: string;
  quantityUnit?: string;
  instructions?: string;
}

interface SendPdfRequest {
  patientName: string;
  userEmail: string;
  doctorName?: string;
  medications: Medication[];
  instructions?: string;
  note?: string;
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

  if (!req.patientName || typeof req.patientName !== 'string' || !req.patientName.trim()) {
    errors.push({ field: 'patientName', message: 'Missing or empty patientName' });
  }

  if (!req.userEmail || typeof req.userEmail !== 'string') {
    // userEmail is optional — PDF can be generated without email
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.userEmail)) {
    errors.push({ field: 'userEmail', message: 'Invalid email address format' });
  }

  if (!req.medications || !Array.isArray(req.medications) || req.medications.length === 0) {
    errors.push({ field: 'medications', message: 'At least one medication is required' });
  }

  return errors;
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

// ─── Helper: extract client IP ──────────────────────────────────────────────

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // ── CORS ──────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-service-secret');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      message: 'Method not allowed',
      error: { code: 'METHOD_NOT_ALLOWED', description: 'Only POST requests are accepted' },
    }));
    return;
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  if (!verifyServiceSecret(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      message: 'Authentication failed',
      error: { code: 'UNAUTHORIZED', description: 'Missing or invalid x-service-secret header' },
    }));
    return;
  }

  // ── Rate Limiting ─────────────────────────────────────────────────────
  const clientIp = getClientIp(req);
  const rateLimitResult = await checkRateLimit(clientIp);

  res.setHeader('X-RateLimit-Remaining', String(rateLimitResult.remaining));
  res.setHeader('X-RateLimit-Reset', String(rateLimitResult.reset));

  if (!rateLimitResult.allowed) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      message: 'Rate limit exceeded',
      error: {
        code: 'RATE_LIMITED',
        description: `Too many requests. Retry after ${Math.ceil((rateLimitResult.reset - Date.now()) / 1000)}s`,
      },
    }));
    return;
  }

  // ── Parse Body ────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      message: 'Invalid JSON body',
      error: { code: 'INVALID_JSON', description: 'Request body must be valid JSON' },
    }));
    return;
  }

  // ── Validate ──────────────────────────────────────────────────────────
  const errors = validate(body);
  if (errors.length > 0) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      message: 'Validation failed',
      error: {
        code: 'VALIDATION_ERROR',
        description: errors.map((e) => `${e.field}: ${e.message}`).join('; '),
      },
    }));
    return;
  }

  const { patientName, userEmail, doctorName, medications, instructions, note } = body as SendPdfRequest;

  // ── Generate PDF ──────────────────────────────────────────────────────
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generatePrescriptionPdf({
      patientName,
      doctorName,
      medications,
      instructions,
      note,
    });
  } catch (err: unknown) {
    const error = err as { message?: string };
    console.error('PDF generation failed:', error.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      message: 'PDF generation failed',
      error: { code: 'PDF_GENERATION_ERROR', description: error.message || 'Unknown PDF error' },
    }));
    return;
  }

  // ── Send Email with PDF Attachment (optional) ──────────────────────────
  let messageId = 'no-email';
  const hasEmail = userEmail && typeof userEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);

  if (hasEmail) {
    try {
      const result = await sendPdfEmail({
        to: userEmail,
        patientName,
        pdfBuffer,
      });
      messageId = result.messageId;
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      console.warn(`Email send failed to ${userEmail}:`, error.message);
      // Continue — PDF was generated successfully, email failure is non-fatal
    }
  }

  // Return PDF as base64 so the app can use it for chat attachment
  const pdfBase64 = pdfBuffer.toString('base64');
  const pdfSizeKB = Math.round(pdfBuffer.length / 1024);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    success: true,
    message: hasEmail ? 'PDF generated and email sent successfully' : 'PDF generated successfully (no email provided)',
    data: {
      recipient: userEmail || '',
      patientName,
      messageId,
      pdfBase64,
      pdfSizeKB,
      timestamp: new Date().toISOString(),
    },
  }));
}
