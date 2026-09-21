import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ordered by preference; we fall through to the next model on repeated 503s.
export const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

function is503(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return e?.status === 503 || (e?.message?.includes("503") ?? false);
}

/**
 * Core generate call with 503 backoff + model fallback. Returns the full
 * response so tool-use turns can read functionCalls/candidates. `contents`
 * accepts a prompt string or a multi-turn contents array.
 */
export async function generateWithRetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contents: any,
  config?: Record<string, unknown>
): Promise<GenerateContentResponse> {
  for (let i = 0; i < MODELS.length; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await ai.models.generateContent({
          model: MODELS[i],
          contents,
          config,
        });
      } catch (err) {
        if (is503(err) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        if (is503(err) && i < MODELS.length - 1) break; // try next model
        throw err;
      }
    }
  }
  throw new Error("all models exhausted");
}

/** Single text generation with 503 backoff + model fallback. */
export async function callGemini(
  prompt: string,
  config?: Record<string, unknown>
): Promise<string> {
  const res = await generateWithRetry(prompt, config);
  return res.text ?? "";
}
