import { type LiveServerMessage, Modality } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import type http from "http";
import { createRouterAI } from "./aiRouter.ts";

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
    } catch {
      // Ignore URL parsing errors for non-matching requests
    }
  });

  wss.on("connection", (clientWs: WebSocket) => {
    let ai;
    try {
      ai = createRouterAI();
    } catch (err: any) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: err?.message || "GEMINI_API_KEY is not configured on the server. Please verify your API key in the Settings > Secrets panel." }));
        clientWs.close();
      }
      return;
    }

    let isClosed = false;

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
          if (clientWs.readyState !== WebSocket.OPEN) return;
          const content = message.serverContent;
          const parts = content?.modelTurn?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.text) {
                clientWs.send(JSON.stringify({ text: part.text }));
              }
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
          }
          if (content?.inputTranscription?.text) {
            clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
          }
          if (content?.outputTranscription?.text) {
            clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
          }
          if (content?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
          if (content?.turnComplete) {
            clientWs.send(JSON.stringify({ turnComplete: true }));
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

    const cleanup = async () => {
      if (isClosed) return;
      isClosed = true;
      try {
        const session = await sessionPromise;
        session?.close();
      } catch {}
    };

    clientWs.on("close", cleanup);
    clientWs.on("error", cleanup);
  });
};
