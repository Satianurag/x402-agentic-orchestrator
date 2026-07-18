import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

const FOLLOW_UP_SYSTEM =
  "You are an agent assistant answering follow-up questions about a completed agent run. " +
  "Use only the provided goal, deliverable, tool context, and spend summary. " +
  "If the answer is not in the context, say so clearly — do not invent paid tool results. " +
  "Be concise, cite sources from the context when available, and use markdown.";

export interface FollowUpInput {
  goal: string;
  deliverable: string;
  question: string;
  toolContext?: unknown[];
  spendSummary?: string;
}

export interface FollowUpResult {
  answer: string;
  thoughts: string;
}

function extractThoughtsAndText(response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>): {
  thoughts: string;
  text: string;
} {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  let thoughts = "";
  let text = "";
  for (const part of parts) {
    if (!part.text) continue;
    if (part.thought) thoughts += `${part.text}\n`;
    else text += part.text;
  }
  if (!text && response.text) text = response.text;
  return { thoughts: thoughts.trim(), text: text.trim() };
}

/** Free follow-up Q&A on a completed run (Gemini only — no new x402 tool calls). */
export async function answerFollowUp(input: FollowUpInput): Promise<FollowUpResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for follow-up chat");

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 5 } },
  });

  const prompt =
    `ORIGINAL GOAL:\n${input.goal}\n\n` +
    `DELIVERABLE:\n${input.deliverable}\n\n` +
    (input.spendSummary ? `SPEND SUMMARY:\n${input.spendSummary}\n\n` : "") +
    (input.toolContext?.length
      ? `TOOL CONTEXT (JSON):\n${JSON.stringify(input.toolContext, null, 2)}\n\n`
      : "") +
    `FOLLOW-UP QUESTION:\n${input.question}`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: FOLLOW_UP_SYSTEM,
      thinkingConfig: { includeThoughts: true },
    },
  });

  const { thoughts, text } = extractThoughtsAndText(response);
  if (!text) throw new Error("Gemini returned empty follow-up answer");

  return { answer: text, thoughts };
}
