import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { RESUME_TEXT } from "@/lib/resume";

/**
 * Agentic JD intake. Give it a job-posting URL and it will use the tool-use
 * loop to fetch the JD, score it against the resume, and return the cleaned
 * JD text plus a match score — which the client then feeds into /api/tailor.
 */
export async function POST(req: NextRequest) {
  const { url, resumeText } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "A job-posting `url` is required" }, { status: 400 });
  }

  const resume = resumeText || RESUME_TEXT;
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `Fetch the job description at ${url}, then score how well the candidate's resume matches it.

When done, reply with ONLY a JSON object (no markdown fences) of the form:
{"jobDescription": "<the cleaned JD text>", "coverage": <0..1>, "missing": ["<missing keyword>"]}

Candidate resume:
${resume}`,
        },
      ],
    },
  ];

  try {
    const { text, steps } = await runAgent(contents, { resumeText: resume });
    let payload: unknown;
    try {
      payload = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      // Fall back to returning the raw text if the model didn't emit JSON.
      payload = { jobDescription: text };
    }
    return NextResponse.json({ ...(payload as object), steps });
  } catch (err) {
    return NextResponse.json(
      { error: "Agent run failed", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
