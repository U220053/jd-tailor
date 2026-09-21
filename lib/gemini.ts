import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ordered by preference; we fall through to the next model on repeated 503s.
export const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

function is503(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return e?.status === 503 || (e?.message?.includes("503") ?? false);
}

/**
 * Single text generation with 503 backoff + model fallback.
 * Optionally accepts a tools/config passthrough for tool-use turns.
 */
export async function callGemini(
  prompt: string,
  config?: Record<string, unknown>
): Promise<string> {
  for (let i = 0; i < MODELS.length; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: MODELS[i],
          contents: prompt,
          config,
        });
        return res.text ?? "";
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
