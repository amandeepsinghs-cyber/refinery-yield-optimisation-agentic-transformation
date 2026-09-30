import { describe, expect, it } from "vitest";
import { SSEParser, parseData } from "@/lib/sse";

describe("SSEParser", () => {
  it("parses named events with JSON data", () => {
    const p = new SSEParser();
    const evs = p.push('event: final\ndata: {"delta":"Hello"}\n\n');
    expect(evs).toEqual([{ event: "final", data: '{"delta":"Hello"}' }]);
    expect(parseData(evs[0])).toEqual({ delta: "Hello" });
  });

  it("handles events split across arbitrary chunk boundaries", () => {
    const p = new SSEParser();
    const stream = 'event: thought\ndata: {"text":"Checking gate"}\n\nevent: tool_call\ndata: {"name":"get_gate_status","args":{}}\n\nevent: done\ndata: {}\n\n';
    const out = [];
    for (let i = 0; i < stream.length; i += 7) out.push(...p.push(stream.slice(i, i + 7)));
    expect(out.map((e) => e.event)).toEqual(["thought", "tool_call", "done"]);
    expect(parseData<{ name: string }>(out[1])?.name).toBe("get_gate_status");
  });

  it("supports CRLF, comments, multi-line data and default 'message' type", () => {
    const p = new SSEParser();
    const evs = p.push(": keep-alive\r\ndata: line1\r\ndata: line2\r\n\r\n");
    expect(evs).toEqual([{ event: "message", data: "line1\nline2" }]);
  });

  it("flushes a trailing unterminated event on end()", () => {
    const p = new SSEParser();
    expect(p.push('event: citation\ndata: {"doc_id":"SOP-FRAC-003"}')).toEqual([]);
    const evs = p.end();
    expect(evs).toHaveLength(1);
    expect(evs[0].event).toBe("citation");
  });

  it("returns null for malformed JSON instead of throwing", () => {
    expect(parseData({ event: "final", data: "{not json" })).toBeNull();
  });
});
