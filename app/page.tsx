"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk";

type Msg = { role: "user" | "assistant"; content: string };

export default function Page() {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Click to start");
  const [language, setLanguage] = useState<"fr-FR" | "en-US" | "es-ES">("en-US");
  const [isClient, setIsClient] = useState(false);
  const [inactivityCountdown, setInactivityCountdown] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const isProcessing = useRef(false);
  const speechQueue = useRef<string[]>([]);
  const isPlayingQueue = useRef(false);

  const historyRef = useRef<Msg[]>([]);
  const languageRef = useRef(language);
  const connectedRef = useRef(false);
  const lastTranscriptRef = useRef("");
  const lastTranscriptTimeRef = useRef(0);
  const utteranceSentRef = useRef(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityDeadlineRef = useRef<number>(0);

  useEffect(() => setIsClient(true), []);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (inactivityIntervalRef.current) clearInterval(inactivityIntervalRef.current);
      try {
        recognitionRef.current?.stop?.();
      } catch {}
    };
  }, []);

  function resetInactivityTimer() {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (inactivityIntervalRef.current) clearInterval(inactivityIntervalRef.current);

    inactivityDeadlineRef.current = Date.now() + 60000;
    setInactivityCountdown(null);

    inactivityTimerRef.current = setTimeout(() => {
      // If still connected after 1 minute of no activity, stop everything.
      if (connectedRef.current) {
        void stopExperience("Session ended due to inactivity");
      }
    }, 60000);

    // Show a visible countdown in the last 15 seconds
    inactivityIntervalRef.current = setInterval(() => {
      const remainingMs = inactivityDeadlineRef.current - Date.now();
      const remainingSec = Math.ceil(remainingMs / 1000);
      if (!connectedRef.current) {
        setInactivityCountdown(null);
        return;
      }
      if (remainingSec <= 15 && remainingSec > 0) {
        setInactivityCountdown(remainingSec);
      } else {
        setInactivityCountdown(null);
      }
    }, 1000);
  }

  async function stopExperience(message = "Session ended") {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (inactivityIntervalRef.current) {
      clearInterval(inactivityIntervalRef.current);
      inactivityIntervalRef.current = null;
    }
    setInactivityCountdown(null);

    // Reset state/flags
    isProcessing.current = false;
    isPlayingQueue.current = false;
    utteranceSentRef.current = false;
    speechQueue.current = [];

    // Stop mic
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    recognitionRef.current = null;

    // Stop avatar session
    try {
      await sessionRef.current?.stop();
    } catch {}
    sessionRef.current = null;

    setConnected(false);
    setLoading(false);
    setStatus(message);
  }

  // -------------------------
  // Queue Management - Play sentences one by one
  // -------------------------
  async function playNextInQueue() {
    if (speechQueue.current.length === 0) {
      console.log("Queue empty");
      isPlayingQueue.current = false;
      isProcessing.current = false;
      utteranceSentRef.current = false;
      setStatus("Listening...");
      setTimeout(() => startListening(), 200);
      return;
    }

    if (isPlayingQueue.current) {
      console.log("Already playing");
      return;
    }

    isPlayingQueue.current = true;
    const text = speechQueue.current.shift()!;
    
    console.log("Playing:", text.substring(0, 40) + "...");
    setStatus("Avatar speaking...");
    resetInactivityTimer();

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      const audioRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!audioRes.ok) {
        throw new Error("TTS error");
      }

      const audioData = await audioRes.json();
      await sessionRef.current?.repeatAudio(audioData.audio);
      console.log("Audio sent");
      resetInactivityTimer();

    } catch (e) {
      console.error("Error:", e);
      isPlayingQueue.current = false;
      if (speechQueue.current.length === 0) {
        isProcessing.current = false;
        utteranceSentRef.current = false;
        setStatus("Listening...");
        startListening();
      } else {
        setTimeout(() => playNextInQueue(), 500);
      }
    }
  }

  // -------------------------
  // Add to queue and start playing if not already
  // -------------------------
  function addToQueue(text: string) {
    if (!text.trim()) return;
    
    console.log("Add to queue:", text.substring(0, 30) + "...");
    speechQueue.current.push(text.trim());
    resetInactivityTimer();
    
    if (!isPlayingQueue.current) {
      playNextInQueue();
    }
  }

  // -------------------------
  // Speech recognition - REUSE same instance (browser only allows start() after user gesture)
  // -------------------------
  function startListening() {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setStatus("Speech recognition not available");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = languageRef.current;
        recognitionRef.current.start();
        setStatus("Listening...");
        console.log("Mic restarted");
      } catch (err: any) {
        if (err?.name === "InvalidStateError" && err?.message?.includes("already started")) {
          setStatus("Listening...");
        } else {
          console.error("Mic restart error:", err);
        }
      }
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;

    recognition.lang = languageRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      if (!connectedRef.current) return;
      
      // Only process FINAL results - wait for complete sentence (no cutoff)
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.trim();
          if (!transcript) continue;

          if (isProcessing.current || isPlayingQueue.current) {
            console.log("Ignored (busy):", transcript.substring(0, 30));
            continue;
          }

          if (utteranceSentRef.current) continue;

          // Check for duplicates (very short window to prevent double-processing)
          const now = Date.now();
          if (transcript === lastTranscriptRef.current && now - lastTranscriptTimeRef.current < 100) {
            console.log("Ignored (duplicate):", transcript.substring(0, 30));
            continue;
          }

          // Process the complete sentence
          utteranceSentRef.current = true;
          isProcessing.current = true;
          lastTranscriptRef.current = transcript;
          lastTranscriptTimeRef.current = now;
          resetInactivityTimer();
          
          try {
            recognition.stop();
          } catch {}
          
          console.log("✅ Complete transcription:", transcript);
          historyRef.current = [...historyRef.current, { role: "user", content: transcript }];
          void sendToAI();
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e?.error === "no-speech") {
        console.log("Recognition: no-speech, will restart");
        return;
      }
      console.log("Speech recognition error:", e?.error);
      if (e?.error === "not-allowed") {
        setStatus("Microphone denied – please allow access");
      }
    };

    recognition.onend = () => {
      console.log("Recognition ended");
      if (connectedRef.current && !isProcessing.current && !isPlayingQueue.current) {
        setTimeout(() => {
          try {
            if (recognitionRef.current === recognition) {
              recognition.lang = languageRef.current;
              recognition.start();
            }
          } catch {}
        }, 300);
      }
    };

    try {
      recognition.start();
      console.log("Mic started");
      setStatus("Listening...");
    } catch (err) {
      console.error("Mic error:", err);
      setStatus("Click to allow microphone");
    }
  }

  // -------------------------
  // AI Streaming
  // -------------------------
  async function sendToAI() {
    try {
      setStatus("Thinking...");
      resetInactivityTimer();
      
      const res = await fetch("/api/groq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historyRef.current, language: languageRef.current }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("API error:", res.status, errText);
        throw new Error(errText || "API error");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";
      let firstChunkSent = false;

      console.log("Streaming AI...");

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        buffer += chunk;

        // Only add to queue at sentence boundaries (. ! ?) – no mid-sentence splits
        const sentenceMatch = buffer.match(/^([^.!?]*[.!?])\s*/);
        if (sentenceMatch) {
          const sentence = sentenceMatch[1].trim();
          if (sentence.length >= 6) {
            if (!firstChunkSent) {
              firstChunkSent = true;
              setStatus("Avatar speaking...");
            }
            console.log("Sentence:", sentence.substring(0, 40) + (sentence.length > 40 ? "..." : ""));
            addToQueue(sentence);
            buffer = buffer.slice(sentenceMatch[0].length);
          }
        }
      }

      if (buffer.trim()) {
        addToQueue(buffer.trim());
      }

      console.log("AI complete:", fullResponse.substring(0, 50) + "...");
      historyRef.current = [...historyRef.current, { role: "assistant", content: fullResponse }];
      resetInactivityTimer();

      // If queue is empty (no text added or already drained), unlock so user can speak again
      if (speechQueue.current.length === 0) {
        isProcessing.current = false;
        utteranceSentRef.current = false;
        setStatus("Listening...");
        startListening();
      }

      // Safety: only unlock if still "processing" AND queue is empty (avatar stuck, not playing)
      setTimeout(() => {
        if (isProcessing.current && speechQueue.current.length === 0) {
          console.log("Safety: reset processing (timeout)");
          isProcessing.current = false;
          isPlayingQueue.current = false;
          utteranceSentRef.current = false;
          setStatus("Listening...");
          startListening();
        }
      }, 12000);

    } catch (e) {
      console.error("AI error:", e);
      isProcessing.current = false;
      isPlayingQueue.current = false;
      utteranceSentRef.current = false;
      setTimeout(() => {
        setStatus("Listening...");
        startListening();
      }, 1000);
    }
  }

  // -------------------------
  // Start Experience
  // -------------------------
  async function startExperience() {
    if (loading || connected) return;

    setLoading(true);
    setStatus("Connecting...");
    resetInactivityTimer();

    // Start mic on user click so browser allows microphone (user gesture)
    startListening();

    try {
      if (sessionRef.current) {
        try {
          await sessionRef.current.stop();
        } catch {}
        sessionRef.current = null;
      }

      const sRes = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", quality: "high", language }),
      });

      const sJson = await sRes.json();

      if (!sRes.ok) {
        throw new Error(sJson?.error || "Session error");
      }

      const { sessionToken } = sJson;

      if (!sessionToken) {
        throw new Error("Missing session token");
      }

      const session = new LiveAvatarSession(sessionToken, {
        voiceChat: false,
      });

      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        console.log("SDK state:", state);
        if (state === SessionState.CONNECTED) {
          setConnected(true);
          setLoading(false);
          setStatus("Connected!");
        }
      });

      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        console.log("Stream ready");
        if (videoRef.current) {
          session.attach(videoRef.current);
        }
      });

      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        console.log("Avatar speaking");
      });

      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        console.log("Avatar finished");
        isPlayingQueue.current = false;
        playNextInQueue();
      });

      await session.start();
      console.log("SDK started");

      const welcomeByLang: Record<string, string> = {
        "en-US": "Hello! How can I help you?",
        "es-ES": "¡Hola! ¿Cómo puedo ayudarte?",
        "fr-FR": "Bonjour ! Comment puis-je vous aider ?",
      };
      setTimeout(() => {
        const lang = languageRef.current;
        addToQueue(welcomeByLang[lang] ?? welcomeByLang["en-US"]);
      }, 1500);

    } catch (e: any) {
      console.error("Error:", e);
      setLoading(false);
      setStatus(e?.message || "Error");
    }
  }

  if (!isClient) return null;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 30,
          left: "50%",
          transform: "translateX(-50%)",
          color: "white",
          zIndex: 10,
          background: "rgba(128, 0, 32, 0.8)",
          padding: "12px 25px",
          borderRadius: "30px",
          border: "1px solid white",
        }}
      >
        {status}
      </div>

      {connected && inactivityCountdown !== null && (
        <div
          style={{
            position: "absolute",
            top: 30,
            left: 20,
            color: "white",
            zIndex: 10,
            background: "rgba(0,0,0,0.55)",
            padding: "10px 14px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.6)",
            fontFamily: "sans-serif",
          }}
        >
          Session ends in {inactivityCountdown}s
        </div>
      )}

      {connected && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 10,
            zIndex: 10,
          }}
        >
          {(["fr-FR", "en-US", "es-ES"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => {
                setLanguage(lang);
                startListening();
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 16,
                border: "1px solid #fff",
                background: language === lang ? "#222" : "rgba(0,0,0,0.5)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {lang === "fr-FR" ? "FR" : lang === "en-US" ? "EN" : "ES"}
            </button>
          ))}
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />

      {!connected && !loading && (
        <div
          onClick={startExperience}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            cursor: "pointer",
            zIndex: 5,
            background: "rgba(0,0,0,0.6)",
          }}
        >
          <h2
            style={{
              background: "#800020",
              padding: "15px 40px",
              borderRadius: "50px",
              border: "2px solid white",
            }}
          >
            Démarrer l&apos;accueil 🚀
          </h2>

          <div style={{ marginTop: 18, display: "flex", gap: 10, opacity: 0.9 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLanguage("fr-FR");
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 16,
                border: "1px solid #fff",
                background: language === "en-US" ? "#222" : "transparent",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              FR
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLanguage("en-US");
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 16,
                border: "1px solid #fff",
                background: language === "en-US" ? "#222" : "transparent",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              EN
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLanguage("es-ES");
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 16,
                border: "1px solid #fff",
                background: language === "es-ES" ? "#222" : "transparent",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ES
            </button>
          </div>
        </div>
      )}

      {loading && !connected && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            zIndex: 6,
            background: "rgba(0,0,0,0.55)",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          Connecting...
        </div>
      )}
    </div>
  );
}