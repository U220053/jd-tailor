import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RESUME_TEXT } from "@/lib/resume";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: NextRequest) {
  const { jobDescription, resumeText: uploadedResume, company, role } = await req.json();
  const resumeText = uploadedResume || RESUME_TEXT;

  const prompt = `You are helping a candidate tailor their resume to a job description.

Job Description:
${jobDescription}

Candidate's Resume:
${resumeText}

Return ONLY valid JSON, no preamble, no markdown fences, in this exact shape:
{
  "name": "candidate full name",
  "contact": {
    "phone": "phone number or empty string",
    "email": "email or empty string",
    "linkedin": "linkedin url or empty string",
    "github": "github url or empty string"
  },
  "experience": [
    {
      "company": "company name",
      "role": "job title",
      "duration": "date range",
      "bullets": ["tailored bullet 1", "tailored bullet 2"]
    }
  ],
  "skills": ["skill1", "skill2"],
  "education": [
    {
      "school": "school name",
      "degree": "degree",
      "year": "year range",
      "grade": "GPA or grade if present"
    }
  ],
  "achievements": ["achievement 1", "achievement 2"],
  "projects": [
    {
      "name": "project name",
      "tech": "tech stack",
      "bullets": ["bullet 1"]
    }
  ],
  "relevanceNotes": "1-2 sentences on what to emphasize for this JD"
}

Rules:
- Tailor bullets to match the JD's priorities but ALWAYS preserve quantified metrics (numbers, percentages, dollar amounts, user counts)
- Do not invent experience that isn't in the resume
- Keep bullets concise, max 20 words each
- Preserve all experience entries from the original resume
- Extract and include an "achievements" array: ["achievement 1", "achievement 2"]
- Extract and include a "projects" array with shape: [{"name": "...", "tech": "...", "bullets": ["..."]}]`;

  const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
  let response;
  for (let i = 0; i < models.length; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: models[i],
          contents: prompt,
        });
        break;
      } catch (err: any) {
        const is503 = err?.status === 503 || err?.message?.includes("503");
        if (is503 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        if (is503 && i < models.length - 1) break;
        throw err;
      }
    }
    if (response) break;
  }

  const raw = response!.text ?? "{}";
  let parsed;

  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json(
      { error: "Failed to parse LLM response", raw },
      { status: 500 }
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
