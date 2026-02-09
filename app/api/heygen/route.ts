import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const liveAvatarKey = process.env.LIVEAVATAR_API_KEY;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

  if (!liveAvatarKey || !elevenLabsKey) {
    return NextResponse.json({ error: "Missing keys" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const language = body?.language as string | undefined;

  const defaultAvatarId = "36ec1997-977e-4fe5-9772-ae416beff3d7";
  const englishAvatarId = process.env.LIVEAVATAR_AVATAR_ID_EN;
  const avatarId =
    language === "en-US" && englishAvatarId ? englishAvatarId : defaultAvatarId;

  const r = await fetch("https://api.liveavatar.com/v1/sessions/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": liveAvatarKey,
    },
    body: JSON.stringify({
      mode: "FULL",
      avatar_id: avatarId,
      avatar_persona: {
        voice_type: "elevenlabs",
        voice_id: "c6SfcYrb2t09NHXiT80T",
        elevenlabs_api_key: elevenLabsKey,
        elevenlabs_model_id: "eleven_multilingual_v2",
      },
    }),
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) return NextResponse.json(data, { status: r.status });
  return NextResponse.json(data);
}