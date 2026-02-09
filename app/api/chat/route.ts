import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY is missing" }, { status: 401 });
  }
  try {
    const { message } = await req.json();
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are a helpful assistant embodied by a video avatar." },
        { role: "user", content: message },
      ],
    });

    return NextResponse.json({ text: completion.choices[0]?.message?.content ?? "" });
  } catch (error) {
    return NextResponse.json({ error: "Groq error" }, { status: 500 });
  }
}
