import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, message: "api/session alive" });
}

export async function POST(req: Request) {
  const liveAvatarKey = process.env.LIVEAVATAR_API_KEY;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

  if (!liveAvatarKey || !elevenLabsKey) {
    return NextResponse.json(
      { error: "LIVEAVATAR_API_KEY or ELEVENLABS_API_KEY is missing" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const language = body?.language as string | undefined; // e.g. "fr-FR" | "en-US" | "es-ES"

  try {
    // -------------------------------------------
    // ACTION: start -> Créer token et démarrer session
    // -------------------------------------------
    if (action === "start") {
      const defaultAvatarId = "36ec1997-977e-4fe5-9772-ae416beff3d7";
      const englishAvatarId = process.env.LIVEAVATAR_AVATAR_ID_EN;
      const avatarId =
        language === "en-US" && englishAvatarId
          ? englishAvatarId
          : defaultAvatarId;

      console.log("Creating token (CUSTOM mode)...", { language, avatarId });

      // 1) Créer token LiveAvatar en mode CUSTOM
      const tRes = await fetch("https://api.liveavatar.com/v1/sessions/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": liveAvatarKey,
        },
        body: JSON.stringify({
          mode: "CUSTOM",
          avatar_id: avatarId,
        }),
      });

      const tJson = await tRes.json();
      console.log("Token response:", tJson);

      if (!tRes.ok) {
        console.error("Token error:", tJson);
        return NextResponse.json(tJson, { status: tRes.status });
      }

      const sessionToken = tJson?.data?.session_token;
      const sessionId = tJson?.data?.session_id;

      if (!sessionToken) {
        return NextResponse.json(
          { error: "session_token not found", raw: tJson },
          { status: 500 }
        );
      }

      console.log("Session token created");

      // ✅ Retourner UNIQUEMENT le token
      // Le frontend va appeler /sessions/start lui-même
      return NextResponse.json({
        sessionId,
        sessionToken,
      });
    }

    // -------------------------------------------
    // ACTION: keep-alive (optionnel mais recommandé)
    // -------------------------------------------
    if (action === "keep-alive") {
      const sessionToken = body?.sessionToken;

      if (!sessionToken) {
        return NextResponse.json(
          { error: "sessionToken required" },
          { status: 400 }
        );
      }

      const res = await fetch("https://api.liveavatar.com/v1/sessions/keep-alive", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Error keeping session alive:", errorData);
        return NextResponse.json(
          {
            error: errorData.data?.message || "Failed to keep session alive",
          },
          { status: res.status }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Session kept alive successfully",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    console.error("Server error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}