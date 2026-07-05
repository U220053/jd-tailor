# JD Tailor

An AI-powered resume tailoring tool. Upload your resume PDF, paste a job description, and get a tailored resume with a one-click PDF download — in seconds.

Built with **Next.js 16**, **Google Gemini**, **Puppeteer**, and **Neon Postgres**.

---

## Features

- **PDF resume parsing** — upload any text-based resume PDF
- **AI tailoring** — Gemini rewrites experience bullets to match the JD's priorities while preserving all quantified metrics
- **Full resume structure** — extracts and tailors experience, projects, achievements, skills, and education
- **PDF generation** — Puppeteer renders a clean, ATS-friendly PDF ready to download
- **Auto-save** — every run is stored in Postgres (company, role, JD, resume snapshot, tailored output)
- **Resilient API** — automatic retry with exponential backoff, falls back to `gemini-2.0-flash` on 503s

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| AI | Google Gemini 2.5 Flash via `@google/genai` |
| PDF parsing | pdf-parse v2 |
| PDF generation | Puppeteer (headless Chromium) |
| Database | Neon (serverless Postgres) via `pg` |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/your-username/jd-tailor.git
cd jd-tailor
npm install
```

### 2. Set up environment variables

Create a `.env` file in the root:

```env
GEMINI_API_KEY=your_google_ai_studio_key
DATABASE_URL=your_neon_postgres_connection_string
```

- Get a Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey)
- Get a free Neon database at [neon.tech](https://neon.tech)

### 3. Initialize the database

Run the schema against your Neon database:

```bash
psql $DATABASE_URL -f app/db/schema.sql
```

Or use the Node script if `psql` isn't available:

```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sql = require('fs').readFileSync('./app/db/schema.sql', 'utf8');
pool.query(sql).then(() => { console.log('done'); pool.end(); });
"
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How It Works

1. **Upload** — the `/api/upload` route parses the resume PDF using `PDFParse` and extracts raw text
2. **Tailor** — the `/api/tailor` route sends the JD + resume text to Gemini, which returns a structured JSON with tailored bullets, preserved metrics, and extracted sections
3. **Generate** — the `/api/generate-pdf` route renders the structured JSON into clean HTML and uses Puppeteer to produce a downloadable PDF
4. **Save** — the application and tailored output are stored in Postgres for reference

---

## Project Structure

```
app/
  page.tsx                  # Main UI
  api/
    upload/route.ts         # PDF text extraction
    tailor/route.ts         # Gemini AI tailoring
    generate-pdf/route.ts   # Puppeteer PDF generation
  db/
    schema.sql              # Postgres schema
lib/
  db.ts                     # Postgres connection pool
  resume.ts                 # Default resume fallback
```

---

## Database Schema

```sql
applications       -- stores company, role, JD text, resume snapshot
generated_outputs  -- stores tailored bullets, relevance notes per application
```

---

## Deployment

Deploy to [Vercel](https://vercel.com):

```bash
vercel deploy
```

Set `GEMINI_API_KEY` and `DATABASE_URL` in your Vercel project environment variables.

> **Note:** Puppeteer requires a Chromium binary. On Vercel, use [`@sparticuz/chromium`](https://github.com/Sparticuz/chromium) with `puppeteer-core` instead of the full `puppeteer` package for serverless compatibility.
