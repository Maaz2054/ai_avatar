import Groq from "groq-sdk";

type Msg = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY is missing" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const groq = new Groq({ apiKey });

  try {
    const body = await req.json().catch(() => ({}));
    const history: Msg[] = Array.isArray(body?.history) ? body.history : [];
    const language = (body?.language as string) || "fr-FR";

    const systemPrompts: Record<string, string> = {
      "en-US":
        "You are the host of Auberge Alternative in Montreal. Reply in ENGLISH only. MAX 2 short sentences (20-30 words). RULES: (1) Answer ONLY the user's LATEST question or message. Do NOT continue or complete your previous reply. Do NOT repeat what you already said. (2) Start your reply immediately with a direct answer to what they just asked. Be friendly and brief.",
      "es-ES":
        "Eres el anfitrión de la Auberge Alternative en Montreal. Responde SOLO en ESPAÑOL. MÁXIMO 2 frases cortas (20-30 palabras). REGLAS: (1) Responde ÚNICAMENTE a la última pregunta o mensaje del usuario. NO continúes ni completes tu respuesta anterior. NO repitas lo que ya dijiste. (2) Empieza tu respuesta de inmediato con una respuesta directa. Sé amable y breve.",
      "fr-FR":
        "Tu es l'hôte de l'Auberge Alternative à Montréal. Réponds en français uniquement. MAX 2 phrases courtes (20-30 mots). RÈGLES: (1) Réponds UNIQUEMENT à la dernière question ou au dernier message de l'utilisateur. NE continue pas ta réponse précédente. NE répète pas ce que tu as déjà dit. (2) Commence ta réponse tout de suite par une réponse directe. Sois amical et concis.",
    };
    const systemContent = systemPrompts[language] ?? systemPrompts["fr-FR"];

    const messages = [
      { role: "system" as const, content: systemContent },
      ...history
        .filter(
          (m) =>
            m &&
            typeof m === "object" &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0
        )
        .slice(-4)
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    const stream = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      temperature: 0.6,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices?.[0]?.delta?.content;
            if (typeof text === "string" && text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Erreur Groq" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
