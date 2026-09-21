# Gobadi Email Services

Monorepo for two independent Vercel serverless email microservices.

## Services

| Service | URL | Purpose |
|---|---|---|
| **Email Service** | [gobaadiemailservice.vercel.app](https://gobaadiemailservice.vercel.app/) | Generic email sending (SMTP via Gmail) |
| **PDF Email Service** | [pdf-email-service-wheat.vercel.app/api](https://pdf-email-service-wheat.vercel.app/api) | Prescription PDF generation + optional email delivery |

---

## 1. Email Service

Sends emails via Gmail SMTP. Used for transactional emails (OTP, notifications, etc.).

### Endpoints

**Health Check**
```
GET https://gobaadiemailservice.vercel.app/
```
Response:
```json
{ "service": "Gobadi Email Service", "status": "healthy" }
```

**Send Email**
```
POST https://gobaadiemailservice.vercel.app/api/send-email
Headers:
  Content-Type: application/json
  x-api-key: <EMAIL_API_KEY>
```
Body:
```json
{
  "to": "user@example.com",
  "subject": "Welcome to Gobadi",
  "html": "<h1>Welcome!</h1><p>Your account is ready.</p>",
  "text": "Welcome! Your account is ready.",
  "meta": { "purpose": "signup" }
}
```
| Field | Required | Description |
|---|---|---|
| `to` | yes | Recipient email |
| `subject` | yes | Email subject line |
| `html` | yes | HTML body |
| `text` | no | Plain text fallback |
| `meta` | no | Arbitrary metadata returned in response |

---

## 2. PDF Email Service

Generates prescription PDFs using PDFKit and optionally emails them. Rate-limited via Upstash Redis.

### Endpoints

**Health Check**
```
GET https://pdf-email-service-wheat.vercel.app/api
```

**Send Prescription PDF**
```
POST https://pdf-email-service-wheat.vercel.app/api/send-pdf
Headers:
  Content-Type: application/json
  x-service-secret: <INTERNAL_SERVICE_SECRET>
```
Body:
```json
{
  "patientName": "Rahul Kumar",
  "userEmail": "rahul@example.com",
  "doctorName": "Dr. Sharma",
  "medications": [
    {
      "name": "Amoxicillin",
      "type": "Capsule",
      "dosage": "500",
      "dosageUnit": "mg",
      "frequency": "Twice daily",
      "duration": "7",
      "durationUnit": "days",
      "quantity": "14",
      "quantityUnit": "capsules",
      "instructions": "Take after food"
    }
  ],
  "instructions": "Complete the full course. Avoid dairy products.",
  "note": "Follow up in 2 weeks"
}
```
| Field | Required | Description |
|---|---|---|
| `patientName` | yes | Patient name on prescription |
| `userEmail` | no | If provided, PDF is emailed to this address |
| `doctorName` | no | Doctor name on prescription |
| `medications` | yes | Array of medication objects (at least one) |
| `instructions` | no | General instructions |
| `note` | no | Additional note |

Response (200):
```json
{
  "success": true,
  "message": "PDF generated and email sent successfully",
  "data": {
    "recipient": "rahul@example.com",
    "patientName": "Rahul Kumar",
    "messageId": "<smtp-message-id>",
    "pdfBase64": "<base64-encoded-pdf>",
    "pdfSizeKB": 42,
    "timestamp": "2026-09-21T12:00:00.000Z"
  }
}
```

### Rate Limiting

- 10 requests per 60 seconds per IP
- Headers returned: `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- On exceed: `429 Too Many Requests`

---

## Environment Variables

### Email Service

| Variable | Description |
|---|---|
| `EMAIL_API_KEY` | Auth token — generate with `openssl rand -hex 32` |
| `GMAIL_USER` | Gmail address for SMTP |
| `GMAIL_APP_PASS` | Gmail app password |

### PDF Email Service

| Variable | Description |
|---|---|
| `INTERNAL_SERVICE_SECRET` | Auth token — generate with `openssl rand -hex 32` |
| `GMAIL_USER` | Gmail address for SMTP |
| `GMAIL_APP_PASS` | Gmail app password |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL for rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |

---

## Local Development

```bash
# Email Service
cd email-service
cp .env.example .env   # fill in credentials
npm install
npm run dev

# PDF Email Service
cd pdf-email-service
cp .env.example .env   # fill in credentials
npm install
npm run dev
```

## Deploy

Each service deploys independently to Vercel:

```bash
cd email-service && npm run deploy
cd pdf-email-service && npm run deploy
```

## Tech Stack

- **Runtime:** Vercel Serverless (Node.js)
- **Language:** TypeScript
- **PDF Generation:** PDFKit
- **Email:** Nodemailer (Gmail SMTP)
- **Rate Limiting:** Upstash Redis + @upstash/ratelimit
