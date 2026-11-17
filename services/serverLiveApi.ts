import { GoogleGenAI, type LiveServerMessage, Modality } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import type http from "http";

export const setupGeminiLiveWebSocket = (server: http.Server) => {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const pathname = request.url ? new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname : "";
      if (pathname === "/api/gemini/live" || pathname === "/live") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      }
    } catch (e) {
      // Ignore URL parsing errors for non-matching requests
    }
  });

  wss.on("connection", (clientWs: WebSocket) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      clientWs.send(JSON.stringify({ error: "GEMINI_API_KEY is not configured on the server. Please verify your API key in the Settings > Secrets panel." }));
      clientWs.close();
      return;
    }

    let isClosed = false;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const sessionPromise = ai.live.connect({
      model: "gemini-3.8-live",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
        },
        systemInstruction: "Você é o assistente de voz em tempo real do Guerreiros Volleyball Club. Responda em português brasileiro com simpatia e agilidade esportiva.",
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          const parts = message.serverContent?.modelTurn?.parts;
          if (parts && clientWs.readyState === WebSocket.OPEN) {
            for (const part of parts) {
              if (part.text) {
                clientWs.send(JSON.stringify({ text: part.text }));
              }
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
          }
          if (message.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
        onerror: (err: any) => {
          console.error("[Live API Upstream error]", err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ error: err?.message || "Gemini Live upstream error" }));
            clientWs.close();
          }
        },
        onclose: () => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close();
          }
        },
      },
    }).then((session) => {
      if (isClosed) {
        try { session.close(); } catch {}
      }
      return session;
    }).catch((err: any) => {
      console.error("[Live API Session error]", err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: err?.message || "Failed to establish Live session" }));
        clientWs.close();
      }
      return null;
    });

    clientWs.on("message", async (data) => {
      try {
        const session = await sessionPromise;
        if (!session || isClosed) return;
        const parsed = JSON.parse(data.toString());
        if (parsed.audio) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
          });
        }
        if (parsed.video) {
          session.sendRealtimeInput({
            video: {
              data: typeof parsed.video === "string" ? parsed.video : parsed.video.data,
              mimeType: parsed.video?.mimeType || "image/jpeg",
            },
          });
        }
        if (parsed.text) {
          session.sendRealtimeInput({
            text: parsed.text,
          });
        }
      } catch (e) {
        console.error("[Live API message parse error]", e);
      }
    });

    clientWs.on("close", async () => {
      isClosed = true;
      try {
        const session = await sessionPromise;
        session?.close();
      } catch {}
    });
  });
};
