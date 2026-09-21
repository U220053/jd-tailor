import { z } from "zod";
import { callGemini } from "./gemini";

// ---------------------------------------------------------------------------
// Output schema — mirrors the shape the PDF renderer and UI consume. Keeping
// this in sync with app/api/generate-pdf and app/page.tsx is intentional: the
// schema is the contract between the model and the rest of the app.
// ---------------------------------------------------------------------------
export const TailoredSchema = z.object({
  name: z.string(),
  contact: z.object({
    phone: z.string(),
    email: z.string(),
    linkedin: z.string(),
    github: z.string(),
  }),
  experience: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      duration: z.string(),
      bullets: z.array(z.string()),
    })
  ),
  skills: z.array(z.string()),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string(),
      year: z.string(),
      grade: z.string(),
    })
  ),
  achievements: z.array(z.string()),
  projects: z.array(
    z.object({
      name: z.string(),
      tech: z.string(),
      bullets: z.array(z.string()),
    })
  ),
  relevanceNotes: z.string(),
});

export type Tailored = z.infer<typeof TailoredSchema>;

// ---------------------------------------------------------------------------
// Keyword helpers — shared by the fabrication guard, score_match, and evals.
// ---------------------------------------------------------------------------
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9.+#]+/g) ?? []).filter(
    (t) => t.length > 1
  );
}

/** True if a skill phrase is grounded in the resume text (every word present). */
export function isSkillGrounded(skill: string, resumeText: string): boolean {
  const haystack = " " + resumeText.toLowerCase() + " ";
  const s = skill.toLowerCase().trim();
  if (haystack.includes(s)) return true;
  // Fall back to per-word grounding for multi-word skills ("state management").
  const words = tokenize(skill);
  return words.length > 0 && words.every((w) => haystack.includes(w));
}

/** Fraction of jdKeywords that appear anywhere in the tailored output. */
export function keywordCoverage(output: Tailored, jdKeywords: string[]): number {
  if (!jdKeywords.length) return 1;
  const blob = flattenText(output).toLowerCase();
  const hit = jdKeywords.filter((k) => blob.includes(k.toLowerCase()));
  return hit.length / jdKeywords.length;
}

/** Flatten every user-facing string in the output into one searchable blob. */
export function flattenText(o: Tailored): string {
  return [
    o.name,
    o.relevanceNotes,
    ...o.skills,
    ...o.achievements,
    ...o.experience.flatMap((e) => [e.company, e.role, ...e.bullets]),
    ...o.projects.flatMap((p) => [p.name, p.tech, ...p.bullets]),
  ].join(" ");
}

function stripFences(raw: string): string {
  return raw.replace(/```json|```/g, "").trim();
}

// ---------------------------------------------------------------------------
// generateTailored — schema validation + retry-on-failure + fabrication guard.
// On each failure we feed the specific error back into the prompt so the model
// can self-correct on the next attempt.
// ---------------------------------------------------------------------------
export async function generateTailored(
  prompt: string,
  resumeText: string,
  retries = 2
): Promise<Tailored> {
  let err = "";
  for (let i = 0; i <= retries; i++) {
    const raw = await callGemini(
      prompt + (err ? `\n\nYour previous attempt was rejected. Fix these errors and return corrected JSON only:\n${err}` : "")
    );

    let json: unknown;
    try {
      json = JSON.parse(stripFences(raw));
    } catch {
      err = "Response was not valid JSON. Return ONLY a JSON object, no prose or markdown fences.";
      continue;
    }

    const parsed = TailoredSchema.safeParse(json);
    if (!parsed.success) {
      err = parsed.error.issues
        .map((iss) => `- ${iss.path.join(".") || "(root)"}: ${iss.message}`)
        .join("\n");
      continue;
    }

    // Guard: reject any skill not grounded in the original resume.
    const fabricated = parsed.data.skills.filter(
      (s) => !isSkillGrounded(s, resumeText)
    );
    if (fabricated.length) {
      err = `Remove skills not present in the original resume: ${fabricated.join(", ")}`;
      continue;
    }

    return parsed.data;
  }
  throw new Error(`validation failed after ${retries + 1} attempts: ${err}`);
}

// ---------------------------------------------------------------------------
// Prompt builder — single source of truth for the tailoring instructions, so
// the app route and the eval suite exercise exactly the same prompt.
// ---------------------------------------------------------------------------
export function buildPrompt(resumeText: string, jobDescription: string): string {
  return `You are helping a candidate tailor their resume to a job description.

Job Description:
${jobDescription}

Candidate's Resume:
${resumeText}

Return ONLY valid JSON, no preamble, no markdown fences, in this exact shape:
{
  "name": "candidate full name",
  "contact": { "phone": "", "email": "", "linkedin": "", "github": "" },
  "experience": [
    { "company": "", "role": "", "duration": "", "bullets": ["tailored bullet"] }
  ],
  "skills": ["skill1", "skill2"],
  "education": [ { "school": "", "degree": "", "year": "", "grade": "" } ],
  "achievements": ["achievement 1"],
  "projects": [ { "name": "", "tech": "", "bullets": ["bullet"] } ],
  "relevanceNotes": "1-2 sentences on what to emphasize for this JD"
}

Rules:
- Tailor bullets to match the JD's priorities but ALWAYS preserve quantified metrics (numbers, percentages, dollar amounts, user counts).
- Do NOT invent experience, projects, or skills that aren't in the resume.
- Every entry in "skills" MUST already appear somewhere in the candidate's resume.
- Keep bullets concise, max 20 words each.
- Preserve all experience entries from the original resume.
- All fields are required; use an empty string or empty array when unknown, never null.`;
}
