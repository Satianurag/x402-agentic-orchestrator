import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

const SYSTEM_INSTRUCTION =
  "You are a research analyst. Synthesize the collected data into a clear, well-structured markdown report " +
  "with headings, bullet points, and source citations where available. Be concise but thorough.";

export async function synthesizeWithLlm(goal: string, context: unknown[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for /synthesize LLM deliverable generation");
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Goal: ${goal}\n\nCollected context from paid x402 services:\n${JSON.stringify(context, null, 2)}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.3,
      maxOutputTokens: 8192,
      httpOptions: {
        retryOptions: {
          attempts: 5,
        },
      },
    },
  });

  const content = response.text;
  if (!content) {
    throw new Error("Gemini returned empty synthesis content");
  }
  return content;
}
