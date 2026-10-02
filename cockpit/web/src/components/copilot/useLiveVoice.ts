"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MIC_TARGET_RATE,
  SPEAKER_RATE,
  StreamingDownsampler,
  base64ToPcm16,
  floatTo16BitPCM,
  pcm16ToBase64,
  pcm16ToFloat,
  rmsLevel,
} from "@/lib/pcm";
import { useCockpit, type ChatMessage } from "@/lib/store";
import type { Citation } from "@/lib/types";
import { uid, usePageContext } from "./useCopilotChat";

export type VoiceState = "idle" | "connecting" | "ready" | "listening" | "speaking" | "error";
export type VoiceMode = "ptt" | "handsfree";

const WS_BASE = process.env.NEXT_PUBLIC_API_WS || "ws://localhost:8010";
const CHUNK_SAMPLES = MIC_TARGET_RATE / 10; // 100 ms per WebSocket frame

/** Merge an incoming transcript piece: servers send either deltas or cumulative text. */
export function mergeTranscript(prev: string, next: string): string {
  if (!prev) return next;
  if (next.startsWith(prev)) return next;
  if (prev.endsWith(next)) return prev;
  const needsSpace = !/\s$/.test(prev) && !/^[\s.,;:!?]/.test(next);
  return prev + (needsSpace ? " " : "") + next;
}

/**
 * Gemini Live voice session over WS /api/live (contract §7):
 * mic → AudioWorklet → 16 kHz PCM16 base64 frames; 24 kHz PCM16 responses are
 * scheduled gaplessly on an AudioContext and cut on `interrupted`.
 */
export function useLiveVoice() {
  const ctx = usePageContext();
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);
  const setMessages = useCockpit((s) => s.setMessages);

  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [mode, setMode] = useState<VoiceMode>("ptt");
  const [model, setModel] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const capturingRef = useRef(false);
  const pendingRef = useRef<Int16Array[]>([]);
  const pendingLenRef = useRef(0);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef(0);
  // SDD-GEM-04: keep the open Live session aware of the screen (route, focus unit, rendered digest). Debounced and
  // de-duplicated so hover churn does not flood the socket; the server injects it without completing a turn.
  const lastCtxKeyRef = useRef("");
  const sendContext = useCallback((force = false) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const c = ctxRef.current;
    const payload = { type: "context", page: c.page, time_min: c.time_min, lang: c.lang, screen: c.screen };
    let key = "";
    try { key = JSON.stringify(payload); } catch { key = String(Date.now()); }
    if (!force && key === lastCtxKeyRef.current) return;
    lastCtxKeyRef.current = key;
    ws.send(key);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => sendContext(false), 1500);
    return () => clearTimeout(t);
  }, [ctx, sendContext]);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const curMsgRef = useRef<{ user: string | null; model: string | null }>({ user: null, model: null });
  const modeRef = useRef<VoiceMode>("ptt");
  const closingRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    useCockpit.setState({ voiceActive: state !== "idle" && state !== "error" });
  }, [state]);

  const upsertTranscript = useCallback(
    (role: "user" | "model", text: string, final: boolean) => {
      const key = role;
      const chatRole: ChatMessage["role"] = role === "user" ? "user" : "assistant";
      const id = curMsgRef.current[key];
      if (!id) {
        const nid = uid();
        curMsgRef.current[key] = nid;
        setMessages((ms) => [...ms, { id: nid, role: chatRole, content: text, voice: true, final, citations: [] }]);
      } else {
        setMessages((ms) =>
          ms.map((m) => (m.id === id ? { ...m, content: mergeTranscript(m.content, text), final } : m)),
        );
      }
      if (final && role === "user") curMsgRef.current.user = null;
    },
    [setMessages],
  );

  const stopPlayback = useCallback(() => {
    for (const s of sourcesRef.current) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    sourcesRef.current.clear();
    nextTimeRef.current = 0;
  }, []);

  const playChunk = useCallback((b64: string) => {
    let pc = playCtxRef.current;
    if (!pc) {
      pc = new AudioContext({ sampleRate: SPEAKER_RATE });
      playCtxRef.current = pc;
    }
    const f32 = pcm16ToFloat(base64ToPcm16(b64));
    if (!f32.length) return;
    const buf = pc.createBuffer(1, f32.length, SPEAKER_RATE);
    buf.copyToChannel(f32 as Float32Array<ArrayBuffer>, 0);
    const src = pc.createBufferSource();
    src.buffer = buf;
    src.connect(pc.destination);
    const startAt = Math.max(nextTimeRef.current, pc.currentTime + 0.03);
    src.start(startAt);
    nextTimeRef.current = startAt + buf.duration;
    sourcesRef.current.add(src);
    src.onended = () => {
      sourcesRef.current.delete(src);
      if (sourcesRef.current.size === 0) {
        setState((s) => (s === "speaking" ? (capturingRef.current ? "listening" : "ready") : s));
      }
    };
    setState("speaking");
  }, []);

  const flush = useCallback((force = false) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!force && pendingLenRef.current < CHUNK_SAMPLES) return;
    if (!pendingLenRef.current) return;
    const out = new Int16Array(pendingLenRef.current);
    let o = 0;
    for (const c of pendingRef.current) {
      out.set(c, o);
      o += c.length;
    }
    pendingRef.current = [];
    pendingLenRef.current = 0;
    ws.send(JSON.stringify({ type: "audio", data: pcm16ToBase64(out) }));
  }, []);

  const teardownMic = useCallback(() => {
    capturingRef.current = false;
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void micCtxRef.current?.close().catch(() => undefined);
    micCtxRef.current = null;
    setLevel(0);
  }, []);

  const disconnect = useCallback(() => {
    closingRef.current = true;
    teardownMic();
    stopPlayback();
    wsRef.current?.close();
    wsRef.current = null;
    void playCtxRef.current?.close().catch(() => undefined);
    playCtxRef.current = null;
    curMsgRef.current = { user: null, model: null };
    setState("idle");
  }, [stopPlayback, teardownMic]);

  const setupMic = useCallback(async () => {
    if (micCtxRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot capture microphone audio.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = (e as DOMException).name;
      throw new Error(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was denied. Allow the microphone for this site and try again."
          : name === "NotFoundError"
            ? "No microphone was found."
            : `Microphone error: ${(e as Error).message}`,
      );
    }
    const ac = new AudioContext();
    await ac.audioWorklet.addModule("/worklets/pcm-capture.js");
    const src = ac.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ac, "pcm-capture");
    const ds = new StreamingDownsampler(ac.sampleRate, MIC_TARGET_RATE);
    let lastLevel = 0;
    node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const frame = ev.data;
      const now = performance.now();
      if (now - lastLevel > 60) {
        lastLevel = now;
        setLevel(capturingRef.current ? rmsLevel(frame) : 0);
      }
      if (!capturingRef.current) return;
      const pcm = floatTo16BitPCM(ds.process(frame));
      pendingRef.current.push(pcm);
      pendingLenRef.current += pcm.length;
      flush();
    };
    src.connect(node);
    // Worklet output is silent; connecting keeps the graph pulling in all browsers.
    const mute = ac.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(ac.destination);
    micCtxRef.current = ac;
    streamRef.current = stream;
    nodeRef.current = node;
  }, [flush]);

  const connect = useCallback((): Promise<void> => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return Promise.resolve();
    closingRef.current = false;
    setError(null);
    setState("connecting");
    const c = ctxRef.current;
    const q = new URLSearchParams();
    if (c.run_id) q.set("run_id", c.run_id);
    q.set("property", c.property);
    if (c.time_min !== null) q.set("time_min", String(c.time_min));
    q.set("page", c.page);
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${WS_BASE}/api/live?${q.toString()}`);
      } catch (e) {
        setState("error");
        setError(`Could not open the voice connection: ${(e as Error).message}`);
        reject(e);
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        /* wait for {type:"ready"} */
      };
      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        switch (msg.type) {
          case "ready":
            setModel((msg.model as string) ?? null);
            sendContext(true);
            setState(capturingRef.current ? "listening" : "ready");
            if (!settled) {
              settled = true;
              resolve();
            }
            break;
          case "audio":
            if (typeof msg.data === "string") playChunk(msg.data);
            break;
          case "transcript":
            upsertTranscript(msg.role === "user" ? "user" : "model", String(msg.text ?? ""), Boolean(msg.final));
            break;
          case "citation": {
            const cit = msg as unknown as Citation;
            let id = curMsgRef.current.model;
            if (!id) {
              id = uid();
              curMsgRef.current.model = id;
              const nid = id;
              setMessages((ms) => [...ms, { id: nid, role: "assistant", content: "", voice: true, citations: [] }]);
            }
            const target = id;
            setMessages((ms) =>
              ms.map((m) =>
                m.id === target && !(m.citations ?? []).some((x) => x.doc_id === cit.doc_id && x.section === cit.section)
                  ? { ...m, citations: [...(m.citations ?? []), cit] }
                  : m,
              ),
            );
            break;
          }
          case "tool_call":
            if (curMsgRef.current.model) {
              const target = curMsgRef.current.model;
              setMessages((ms) =>
                ms.map((m) => (m.id === target ? { ...m, tools: [...(m.tools ?? []), String(msg.name)] } : m)),
              );
            }
            break;
          case "interrupted":
            stopPlayback();
            setState(capturingRef.current ? "listening" : "ready");
            break;
          case "turn_complete":
            if (curMsgRef.current.model) {
              const target = curMsgRef.current.model;
              setMessages((ms) => ms.map((m) => (m.id === target ? { ...m, final: true } : m)));
            }
            curMsgRef.current = { user: null, model: null };
            break;
          case "error":
            setError(String(msg.message ?? "Voice session error"));
            break;
          default:
            break;
        }
      };
      ws.onerror = () => {
        setError("Voice connection failed. Is the cockpit API running on port 8010 with Gemini Live enabled?");
      };
      ws.onclose = (ev) => {
        wsRef.current = null;
        teardownMic();
        stopPlayback();
        if (!closingRef.current) {
          setState("error");
          setError((prev) => prev ?? `Voice connection closed${ev.reason ? `: ${ev.reason}` : ` (code ${ev.code})`}.`);
        }
        if (!settled) {
          settled = true;
          reject(new Error("closed"));
        }
      };
    });
  }, [playChunk, setMessages, stopPlayback, teardownMic, upsertTranscript]);

  /** Begin capturing (push-to-talk press, or hands-free on). */
  const startTalking = useCallback(async () => {
    try {
      await connect();
      await setupMic();
      await micCtxRef.current?.resume();
      stopPlayback(); // barge-in: local playback stops as the user speaks
      capturingRef.current = true;
      setState("listening");
    } catch (e) {
      if ((e as Error).message !== "closed") {
        setError((e as Error).message);
        setState("error");
      }
      teardownMic();
    }
  }, [connect, setupMic, stopPlayback, teardownMic]);

  /** Stop capturing (push-to-talk release): flush audio and signal end-of-turn. */
  const stopTalking = useCallback(() => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    flush(true);
    setLevel(0);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "end" }));
    setState((s) => (s === "listening" ? "ready" : s));
  }, [flush]);

  const sendText = useCallback(
    async (text: string) => {
      await connect();
      wsRef.current?.send(JSON.stringify({ type: "text", text }));
      upsertTranscript("user", text, true);
    },
    [connect, upsertTranscript],
  );

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    state,
    error,
    level,
    mode,
    setMode,
    model,
    startTalking,
    stopTalking,
    disconnect,
    sendText,
    capturing: () => capturingRef.current,
    modeRef,
  };
}

export type LiveVoice = ReturnType<typeof useLiveVoice>;
