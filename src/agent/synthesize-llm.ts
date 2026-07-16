export async function synthesizeWithLlm(goal: string, context: unknown[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for /synthesize LLM deliverable generation");
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a research analyst. Synthesize the collected data into a clear, well-structured markdown report " +
            "with headings, bullet points, and source citations where available. Be concise but thorough.",
        },
        {
          role: "user",
          content: `Goal: ${goal}\n\nCollected context from paid x402 services:\n${JSON.stringify(context, null, 2)}`,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI synthesis failed (${res.status}): ${await res.text()}`);
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty synthesis content");
  }
  return content;
}
