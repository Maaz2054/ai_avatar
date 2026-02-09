"use client";

import React, { useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

export default function AvatarPage() {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Click to start");
  const [language, setLanguage] = useState("en-US");
  const [isListening, setIsListening] = useState(false);
  
  // useState pour l'affichage, useRef pour la logique de l'IA (mémoire réelle)
  const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>([]);
  const historyRef = useRef<{role: string, content: string}[]>([]);
// --- À AJOUTER AVEC LES AUTRES REFS ---
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null); 
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const isAvatarSpeaking = useRef(false);
  const isProcessing = useRef(false); 
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimer = () => {
    // On annule le précédent minuteur
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
  
    // On lance le nouveau minuteur (60000ms = 1 minute)
    inactivityTimerRef.current = setTimeout(() => {
      console.log("Inactivity detected: disconnecting...");
      stopExperience();
    }, 60000); 
  };
  
  const stopExperience = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setConnected(false);
    setStatus("Session ended due to inactivity");
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
  };

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    return () => {
      if (roomRef.current) roomRef.current.disconnect();
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  // --- 1. FONCTION DE MISE À JOUR DE LA MÉMOIRE ---
  function updateHistory(role: "user" | "assistant", content: string) {
    const newMessage = { role, content };
    // On met à jour la REF (immédiat pour le code)
    historyRef.current = [...historyRef.current, newMessage];
    // On met à jour le STATE (pour l'interface si besoin)
    setChatHistory(historyRef.current);
  }

  async function speakText(text: string) {
    if (!roomRef.current || !text.trim()) return;
    isAvatarSpeaking.current = true;
    const payload = { event_type: "avatar.speak_text", text: text.trim(), request_id: crypto.randomUUID() };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    await roomRef.current.localParticipant.publishData(bytes, { reliable: true, topic: "agent-control" });
  }

  // --- 2. RECONNAISSANCE VOCALE ---
  function startListening(currentLang: string) {
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) return;
    if (recognitionRef.current) recognitionRef.current.stop();

    const recognition = new Speech();
    recognitionRef.current = recognition;
    recognition.lang = currentLang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event: any) => {
      if (isAvatarSpeaking.current || isProcessing.current) return;
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript.trim();

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      silenceTimerRef.current = setTimeout(() => {
        if (transcript !== "" && !isAvatarSpeaking.current && !isProcessing.current) {
          isProcessing.current = true;
          // On ajoute le message de l'utilisateur à la mémoire
          updateHistory("user", transcript);
          // On envoie la mémoire COMPLÈTE (via historyRef.current)
          sendToAI();
          recognition.stop(); 
        }
      }, 1200);
    };

    recognition.onend = () => { 
      setIsListening(false);
      if (connected && !isAvatarSpeaking.current && !isProcessing.current) {
        try { recognition.start(); } catch {} 
      }
    };
    try { recognition.start(); } catch {}
  }

  // --- 3. IA AVEC MÉMOIRE RÉELLE ---
  async function sendToAI() {
    try {
      setStatus("Thinking...");

      const res = await fetch("/api/groq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historyRef.current, language }),
      });

      if (!res.body) { isProcessing.current = false; return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sentenceBuffer = "";
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        sentenceBuffer += chunk;
        fullResponse += chunk;

        if (/[.!?\n]/.test(chunk) && sentenceBuffer.trim().length > 3) {
          speakText(sentenceBuffer.trim());
          sentenceBuffer = "";
          setStatus(""); 
        }
      }
      
      if (sentenceBuffer.trim()) speakText(sentenceBuffer.trim());
      
      // On ajoute la réponse de l'IA à la mémoire
      updateHistory("assistant", fullResponse.trim());
      
      setTimeout(() => { isProcessing.current = false; }, 500);

    } catch (e) { 
      setStatus("AI error");
      isProcessing.current = false;
    }
  }

  async function startExperience() {
    if (loading || connected) return;
    setLoading(true);
    setStatus("Connecting...");

    try {
      const tRes = await fetch("/api/heygen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const tJson = await tRes.json();
      const sessionToken = tJson?.data?.session_token || tJson?.data?.token || tJson?.token;

     // --- MODIFICATION DANS app/page.tsx ---
const sRes = await fetch("https://api.liveavatar.com/v1/sessions/start", {
  method: "POST",
  headers: { 
    Authorization: "Bearer " + sessionToken, 
    "Content-Type": "application/json" 
  },
  body: JSON.stringify({
    avatar_id: "4f2850d3-471c-4e60-8b0b-70b63340af00", // Votre nouvel ID extrait de l'iframe
    voice: {
      voice_id: "af60b0b0-489b-46c3-a94a-f4c702c8bb51", // À remplacer par l'ID réel de la voix
    },
    quality: "high"
  }),
});
      const sJson = await sRes.json();
      const { livekit_url, livekit_client_token } = sJson.data;

      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === "video") track.attach(videoRef.current!);
        if (track.kind === "audio") (track.attach() as HTMLAudioElement).autoplay = true;
      });

      room.on(RoomEvent.DataReceived, (payload) => {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.event_type === "avatar.speak_ended") {
          isAvatarSpeaking.current = false;
          isProcessing.current = false;
          setStatus("Listening...");
          startListening(language);
        }
      });

      await room.connect(livekit_url, livekit_client_token);
      await room.startAudio();
      
      setConnected(true);
      setLoading(false);
      setStatus("Ready!");
      startListening(language);
    } catch (e) {
      setLoading(false);
      setStatus("Connection error");
    }
  }

  if (!isClient) return null;

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)', color: 'white', zIndex: 10, background: 'rgba(0,0,0,0.7)', padding: '12px 25px', borderRadius: '30px', fontFamily: 'sans-serif' }}>{status}</div>

      <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '15px', zIndex: 20 }}>
        {[{ code: "fr-FR", flag: "🇫🇷" }, { code: "en-US", flag: "🇺🇸" }, { code: "es-ES", flag: "🇪🇸" }].map((lang) => (
          <button key={lang.code} onClick={() => { setLanguage(lang.code); if (connected) startListening(lang.code); }} style={{ padding: '10px', fontSize: '1.5rem', borderRadius: '50%', border: language === lang.code ? '3px solid white' : 'none', backgroundColor: 'rgba(255,255,255,0.2)', cursor: 'pointer' }}>{lang.flag}</button>
        ))}
      </div>
      
      <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      
      {!connected && !loading && (
        <div onClick={startExperience} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', zIndex: 5, background: 'rgba(0,0,0,0.4)' }}>
          <h2 style={{ background: '#fff', color: '#000', padding: '15px 40px', borderRadius: '50px', fontSize: '1.8rem', fontWeight: 'bold' }}>Start 🚀</h2>
        </div>
      )}
    </div>
  );
}  
