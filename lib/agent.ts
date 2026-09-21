import { Type, type ToolListUnion } from "@google/genai";
import { ai, MODELS } from "./gemini";
import { fetch_jd, get_resume_section, score_match } from "./tools";

// ---------------------------------------------------------------------------
// Tool-use loop: instead of doing everything in one prompt, we let the model
// call our functions (fetch a JD from a URL, read a resume section, score the
// match) and feed the results back until it produces a final answer.
// ---------------------------------------------------------------------------

const tools: ToolListUnion = [
  {
    functionDeclarations: [
      {
        name: "fetch_jd",
        description: "Fetch and clean the job-description text from a careers-page or LinkedIn URL.",
        parameters: {
          type: Type.OBJECT,
          properties: { url: { type: Type.STRING } },
          required: ["url"],
        },
      },
      {
        name: "get_resume_section",
        description: "Return a named section of the candidate's resume (e.g. experience, projects, skills).",
        parameters: {
          type: Type.OBJECT,
          properties: { name: { type: Type.STRING } },
          required: ["name"],
        },
      },
      {
        name: "score_match",
        description: "Score keyword coverage of a resume against a JD; returns coverage plus matched and missing keywords.",
        parameters: {
          type: Type.OBJECT,
          properties: { resume: { type: Type.STRING }, jd: { type: Type.STRING } },
          required: ["resume", "jd"],
        },
      },
    ],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolFn = (args: any) => Promise<unknown>;

/**
 * Build the tool registry. `resumeText` is closed over so get_resume_section
 * reads the caller's uploaded resume rather than the bundled default.
 */
function buildImpl(resumeText?: string): Record<string, ToolFn> {
  return {
    fetch_jd,
    get_resume_section: (args) => get_resume_section({ ...args, resumeText }),
    score_match,
  };
}

export interface AgentResult {
  text: string;
  steps: { tool: string; args: unknown }[];
}

export async function runAgent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contents: any[],
  opts: { maxSteps?: number; resumeText?: string } = {}
): Promise<AgentResult> {
  const { maxSteps = 6, resumeText } = opts;
  const impl = buildImpl(resumeText);
  const steps: { tool: string; args: unknown }[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const res = await ai.models.generateContent({
      model: MODELS[0],
      contents,
      config: { tools },
    });

    const calls = res.functionCalls ?? [];
    if (!calls.length) return { text: res.text ?? "", steps };

    // Echo the model's tool-call turn back into the transcript.
    contents.push(res.candidates![0].content);

    for (const c of calls) {
      const fn = c.name ? impl[c.name] : undefined;
      const out = fn
        ? await fn(c.args)
        : { error: `unknown tool: ${c.name}` };
      steps.push({ tool: c.name ?? "unknown", args: c.args });
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: c.name, response: { out } } }],
      });
    }
  }
  throw new Error("max steps exceeded");
}
