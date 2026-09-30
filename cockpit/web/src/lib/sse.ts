/**
 * Incremental Server-Sent Events parser (WHATWG event-stream format).
 * Used for POST /api/copilot/chat, where EventSource cannot be used.
 */
export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
}

export class SSEParser {
  private buffer = "";
  private eventName = "";
  private dataLines: string[] = [];
  private lastId: string | undefined;

  /** Feed a decoded text chunk; returns every event completed by it. */
  push(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const out: SSEEvent[] = [];
    // Normalise CRLF / CR line endings.
    this.buffer = this.buffer.replace(/\r\n?/g, "\n");
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      const ev = this.processLine(line);
      if (ev) out.push(ev);
    }
    return out;
  }

  /** Flush a trailing event that was not terminated by a blank line. */
  end(): SSEEvent[] {
    const out: SSEEvent[] = [];
    if (this.buffer.length) {
      const ev = this.processLine(this.buffer);
      this.buffer = "";
      if (ev) out.push(ev);
    }
    const ev = this.dispatch();
    if (ev) out.push(ev);
    return out;
  }

  private processLine(line: string): SSEEvent | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null; // comment / keep-alive
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        this.eventName = value;
        break;
      case "data":
        this.dataLines.push(value);
        break;
      case "id":
        this.lastId = value;
        break;
      default:
        break;
    }
    return null;
  }

  private dispatch(): SSEEvent | null {
    if (this.dataLines.length === 0 && !this.eventName) return null;
    const ev: SSEEvent = {
      event: this.eventName || "message",
      data: this.dataLines.join("\n"),
      ...(this.lastId !== undefined ? { id: this.lastId } : {}),
    };
    this.eventName = "";
    this.dataLines = [];
    return ev;
  }
}

/** Safely parse the JSON payload of an SSE event. */
export function parseData<T = Record<string, unknown>>(ev: SSEEvent): T | null {
  if (!ev.data) return {} as T;
  try {
    return JSON.parse(ev.data) as T;
  } catch {
    return null;
  }
}

/**
 * POSTs JSON and streams SSE events to `onEvent`. Resolves when the stream ends.
 */
export async function streamSSE(
  url: string,
  body: unknown,
  onEvent: (ev: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Copilot request failed (HTTP ${res.status})`;
    try {
      const j = (await res.json()) as { error?: string; detail?: string };
      if (j.error) msg = `${j.error}${j.detail ? ` — ${j.detail}` : ""}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const ev of parser.push(decoder.decode(value, { stream: true }))) onEvent(ev);
  }
  for (const ev of parser.end()) onEvent(ev);
}
