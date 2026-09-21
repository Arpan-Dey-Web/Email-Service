import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /
 *
 * Health check / service info endpoint.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.status(200).json({
    service: 'Gobadi PDF & Email Service',
    status: 'healthy',
    endpoints: {
      sendPdf: 'POST /api/send-pdf',
    },
    timestamp: new Date().toISOString(),
  });
}
