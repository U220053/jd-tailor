import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RESUME_TEXT } from "@/lib/resume";
import { QUOTA_MARKER } from "@/lib/gemini";
import { buildPrompt, generateTailored } from "@/lib/schema";

export async function POST(req: NextRequest) {
  const { jobDescription, resumeText: uploadedResume, company, role } =
    await req.json();
  const resumeText = uploadedResume || RESUME_TEXT;

  const prompt = buildPrompt(resumeText, jobDescription);

  let parsed;
  try {
    // Schema-validated, retry-on-failure, guards against fabricated skills.
    parsed = await generateTailored(prompt, resumeText);
  } catch (err) {
    const message = (err as Error).message ?? "";
    if (message.includes(QUOTA_MARKER)) {
      return NextResponse.json(
        {
          error:
            "The AI is rate-limited right now (Gemini free-tier quota). Wait a minute and try again, or enable billing on your Gemini API key for higher limits.",
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Failed to generate a valid tailored resume", detail: message },
      { status: 502 }
    );
  }

  const client = await pool.connect();
  try {
    const appResult = await client.query(
      `INSERT INTO applications (company, role, jd_text, resume_snapshot)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [company ?? null, role ?? null, jobDescription, resumeText]
    );
    const applicationId = appResult.rows[0].id;

    await client.query(
      `INSERT INTO generated_outputs (application_id, tailored_bullets, relevance_notes)
       VALUES ($1, $2, $3)`,
      [applicationId, JSON.stringify(parsed.experience), parsed.relevanceNotes]
    );

    return NextResponse.json({ applicationId, ...parsed });
  } finally {
    client.release();
  }
}
