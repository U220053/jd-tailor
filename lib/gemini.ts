import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ordered by preference. Both are confirmed callable on this API with distinct
// free-tier quotas, so the lite model serves as a fallback when the primary is
// rate-limited. (gemini-2.0-flash 404s; gemini-2.5-flash-lite is "no longer
// available to new users" — both replaced here.)
export const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"] as const;

/** Marker prefix so callers can detect quota/rate-limit exhaustion. */
export const QUOTA_MARKER = "QUOTA_EXCEEDED";

function classify(err: unknown): { overloaded: boolean; quota: boolean } {
  const e = err as { status?: number; message?: string };
  const msg = e?.message ?? "";
  return {
    overloaded: e?.status === 503 || msg.includes("503"),
    quota:
      e?.status === 429 ||
      msg.includes("429") ||
      /RESOURCE_EXHAUSTED|quota/i.test(msg),
  };
}

/**
 * Core generate call with backoff + model fallback. Returns the full response
 * so tool-use turns can read functionCalls/candidates. `contents` accepts a
 * prompt string or a multi-turn contents array.
 *
 * - 503 (overloaded): short exponential backoff on the same model, then fall
 *   through to the next model.
 * - 429 (quota/rate limit): fall straight to the next model (separate quota);
 *   waiting wouldn't help within one request. If every model is exhausted,
 *   throw an error prefixed with QUOTA_MARKER so the route can show a friendly
 *   message instead of Google's raw JSON.
 */
export async function generateWithRetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contents: any,
  config?: Record<string, unknown>
): Promise<GenerateContentResponse> {
  let sawQuota = false;
  for (let i = 0; i < MODELS.length; i++) {
    const lastModel = i === MODELS.length - 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await ai.models.generateContent({
          model: MODELS[i],
          contents,
          config,
        });
      } catch (err) {
        const { overloaded, quota } = classify(err);
        if (quota) sawQuota = true;

        if (overloaded && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        if ((overloaded || quota) && !lastModel) break; // try next model
        if (quota) {
          throw new Error(
            `${QUOTA_MARKER}: Gemini rate/quota limit hit. ${(err as Error).message ?? ""}`
          );
        }
        throw err;
      }
    }
  }
  throw new Error(
    sawQuota ? `${QUOTA_MARKER}: all models rate-limited` : "all models exhausted"
  );
}

/** Single text generation with 503 backoff + model fallback. */
export async function callGemini(
  prompt: string,
  config?: Record<string, unknown>
): Promise<string> {
  const res = await generateWithRetry(prompt, config);
  return res.text ?? "";
}
