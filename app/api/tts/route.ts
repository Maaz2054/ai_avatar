import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

  if (!elevenLabsKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is missing" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { text, voice_id = "4ODIZFF9qwSqogLRcDPS" } = body;

    if (!text) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    console.log("TTS generation:", text.substring(0, 50));

    // ✅ Utiliser l'endpoint /with-timestamps comme dans le démo
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/with-timestamps?output_format=pcm_24000`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenLabsKey,
        },
        body: JSON.stringify({
          text,
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.text();
      console.error("ElevenLabs error:", errorData);
      return NextResponse.json(
        { error: "Audio generation failed", details: errorData },
        { status: res.status }
      );
    }

    const data = await res.json();
    const audio = data.audio_base64;

    console.log("Audio generated");

    return NextResponse.json({ audio });
  } catch (error: any) {
    console.error("Audio generation error:", error);
    return NextResponse.json(
      { error: "Audio generation failed" },
      { status: 500 }
    );
  }
}
