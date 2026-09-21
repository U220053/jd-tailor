import { RESUME_TEXT } from "./resume";
import { keywordCoverage, tokenize, type Tailored } from "./schema";

// ---------------------------------------------------------------------------
// Tool implementations the agent loop can call. Each takes a plain args object
// (as it arrives from the model) and returns a JSON-serialisable result.
// ---------------------------------------------------------------------------

/** Fetch and strip a job description from a careers-page / LinkedIn URL. */
export async function fetch_jd({ url }: { url: string }): Promise<{
  url: string;
  text: string;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      headers: {
        // A browser-ish UA gets past a few naive bot filters.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return { url, text: "", error: `HTTP ${res.status} fetching URL` };
    }
    const html = await res.text();
    return { url, text: htmlToText(html) };
  } catch (e) {
    return { url, text: "", error: (e as Error).message };
  }
}

/** Return a named section of the candidate's resume. */
export async function get_resume_section({
  name,
  resumeText,
}: {
  name: string;
  resumeText?: string;
}): Promise<{ name: string; text: string }> {
  const source = resumeText || RESUME_TEXT;
  return { name, text: extractSection(source, name) };
}

/** Score keyword coverage of a resume against a JD and surface gaps. */
export async function score_match({
  resume,
  jd,
}: {
  resume: string;
  jd: string;
}): Promise<{
  coverage: number;
  matched: string[];
  missing: string[];
}> {
  const jdKeywords = topKeywords(jd, 25);
  const resumeTokens = new Set(tokenize(resume));
  const matched = jdKeywords.filter((k) => resumeTokens.has(k));
  const missing = jdKeywords.filter((k) => !resumeTokens.has(k));
  return {
    coverage: jdKeywords.length ? matched.length / jdKeywords.length : 1,
    matched,
    missing,
  };
}

/** Coverage of an already-parsed Tailored output vs a JD (used by evals). */
export function scoreTailored(output: Tailored, jd: string): number {
  return keywordCoverage(output, topKeywords(jd, 25));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  // 2-letter function words (kept short tokens like "go"/"ml"/"ai" are meaningful).
  "to", "of", "in", "on", "at", "by", "is", "it", "as", "be", "or", "an",
  "we", "do", "up", "so", "if", "no",
  "the", "and", "for", "you", "with", "our", "are", "will", "your", "have",
  "this", "that", "from", "who", "all", "can", "not", "but", "job", "role",
  "work", "team", "team's", "about", "into", "out", "per", "was", "were",
  "they", "their", "them", "she", "him", "her", "his", "its", "has", "had",
  "what", "when", "where", "which", "while", "would", "should", "could",
  "requirements", "responsibilities", "experience", "years", "including",
  "ability", "strong", "good", "great", "plus", "must", "etc",
]);

/** Top-N most frequent, meaningful tokens in a JD — a cheap keyword extractor. */
export function topKeywords(text: string, n: number): string[] {
  const freq = new Map<string, number>();
  for (const tok of tokenize(text)) {
    if (STOPWORDS.has(tok)) continue;
    freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/** Extract a resume section by fuzzy header match (EXPERIENCE, PROJECTS, ...). */
function extractSection(resume: string, name: string): string {
  const lines = resume.split("\n");
  const target = name.toLowerCase().replace(/[^a-z]/g, "");
  const isHeader = (l: string) => {
    const t = l.trim();
    return t.length > 0 && t === t.toUpperCase() && /[A-Z]/.test(t);
  };
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      isHeader(lines[i]) &&
      lines[i].toLowerCase().replace(/[^a-z]/g, "").includes(target)
    ) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return "";
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (isHeader(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

/** Minimal HTML → text: drop scripts/styles/tags, collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}
