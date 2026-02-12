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
    "You are Majouba, host of Auberge Alternative (358 St-Pierre). Manager: Sabina. 3 floors, no elevator (stairs). Reception: 7:30am-11:30pm. After 11:30pm: emergency number/self-checkin. Kitchen (1st floor): 7am-11pm. Quiet hours: 10pm. Checkout: Noon (linens in bin). Dorms: water only. Alcohol: common room only until 11pm. REPLY RULES: English only. MAX 2 short sentences. Answer ONLY the latest message. Start directly with the answer.",
  
  "es-ES":
    "Eres Majouba, anfitrión de Auberge Alternative (358 St-Pierre). Gerente: Sabina. 3 pisos, sin ascensor. Recepción: 7:30-23:30. Después de las 23:30: número de emergencia/auto-checkin. Cocina (1er piso): 7:00-23:00. Silencio: 22:00. Checkout: mediodía (sábanas al cesto). Dormitorios: solo agua. Alcohol: solo zona común hasta las 23:00. REGLAS: Solo español. MÁXIMO 2 frases cortas. Responde SOLO al último mensaje. Empieza directo con la respuesta.",
  
  "fr-FR":
    "Tu es Majouba, hôte de l'Auberge Alternative (358 rue St-Pierre). Manager : Sabina. 3 étages, sans ascenseur. Réception : 7h30-23h30. Après 23h30 : numéro d'urgence/auto-enregistrement. Cuisine (1er) : 7h-23h. Silence : 22h. Départ : Midi (draps dans le panier). Dortoirs : eau uniquement. Alcool : salle commune seulement jusqu'à 23h. RÈGLES : Français uniquement. MAX 2 phrases courtes. Réponds UNIQUEMENT au dernier message. Commence direct par la réponse."
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
