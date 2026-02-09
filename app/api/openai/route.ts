import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export const runtime = "edge";

type Msg = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const history: Msg[] = Array.isArray(body?.history) ? body.history : [];

    // Sécurisation de l'historique
    const messages: Msg[] = [
      {
        role: "system",
        content:
          "Tu es l'hôte de l'Auberge Alternative à Montréal. RÈGLE ABSOLUE: Réponds en MAXIMUM 2 phrases courtes (20-30 mots maximum). Sois direct, amical et québécois. Pas de préambule ni de formules longues. Va droit au but.",
      },
      ...history
        .filter(
          (m) =>
            m &&
            typeof m === "object" &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0
        )
        .slice(-6), // ✅ Réduit à 6 pour contexte encore plus léger
    ];

    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.8,
    });

    // Texte brut streamé
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.textStream) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "OpenAI error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}