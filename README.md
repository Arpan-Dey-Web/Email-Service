# Gobaadi Email Service

Standalone email sending service for Gobadi, deployed as a Vercel serverless function.

## Endpoints

- `GET /api` — Health check
- `POST /api/send-email` — Send an email

## Setup

1. Copy `.env.example` to `.env` and fill in credentials:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Run locally:

```bash
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `EMAIL_API_KEY` | Shared secret for API authentication (`openssl rand -hex 32`) |
| `GMAIL_USER` | Gmail address for SMTP |
| `GMAIL_APP_PASS` | Gmail app password |

## Deploy

```bash
npm run deploy
```
