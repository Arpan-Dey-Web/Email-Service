import type { IncomingMessage } from 'http';

// ─── Auth ───────────────────────────────────────────────────────────────────

/**
 * Constant-time comparison of x-service-secret header against INTERNAL_SERVICE_SECRET env var.
 * Returns false if either side is missing or mismatched.
 */
export function verifyServiceSecret(req: IncomingMessage): boolean {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    console.error('INTERNAL_SERVICE_SECRET env var not set');
    return false;
  }

  const provided = req.headers['x-service-secret'];
  if (!provided || Array.isArray(provided)) return false;

  // Constant-time comparison to prevent timing attacks
  if (provided.length !== secret.length) return false;
  let result = 0;
  for (let i = 0; i < provided.length; i++) {
    result |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return result === 0;
}
