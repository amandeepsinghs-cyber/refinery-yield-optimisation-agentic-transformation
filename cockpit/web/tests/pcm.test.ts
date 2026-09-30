import { describe, expect, it } from "vitest";
import {
  StreamingDownsampler,
  base64ToPcm16,
  downsample,
  floatTo16BitPCM,
  pcm16ToBase64,
  pcm16ToFloat,
} from "@/lib/pcm";
import { mergeTranscript } from "@/components/copilot/useLiveVoice";

describe("PCM16 resampler", () => {
  it("downsamples 48 kHz to 16 kHz with the right length and preserves DC", () => {
    const input = new Float32Array(4800).fill(0.5); // 100 ms
    const out = downsample(input, 48_000, 16_000);
    expect(out.length).toBe(1600);
    expect(Math.max(...out)).toBeCloseTo(0.5, 6);
    expect(Math.min(...out)).toBeCloseTo(0.5, 6);
  });

  it("handles non-integer ratios (44.1 kHz → 16 kHz)", () => {
    const out = downsample(new Float32Array(44_100), 44_100, 16_000);
    expect(out.length).toBe(16_000);
  });

  it("streaming downsampler yields the same total as one-shot for chunked input", () => {
    const ds = new StreamingDownsampler(48_000, 16_000);
    let total = 0;
    for (let i = 0; i < 10; i++) total += ds.process(new Float32Array(2048)).length;
    expect(total).toBe(Math.floor((2048 * 10) / 3));
  });

  it("preserves a low-frequency sine through downsampling", () => {
    const n = 48_000;
    const input = new Float32Array(n);
    for (let i = 0; i < n; i++) input[i] = Math.sin((2 * Math.PI * 440 * i) / 48_000);
    const out = downsample(input, 48_000, 16_000);
    const rms = Math.sqrt(out.reduce((a, v) => a + v * v, 0) / out.length);
    expect(rms).toBeGreaterThan(0.65); // ~0.707 for a full-scale sine
  });

  it("clamps and converts float to int16 and back", () => {
    const pcm = floatTo16BitPCM(new Float32Array([-2, -1, 0, 0.5, 1, 2]));
    expect(Array.from(pcm)).toEqual([-32768, -32768, 0, 16384, 32767, 32767]);
    const back = pcm16ToFloat(pcm);
    expect(back[0]).toBe(-1);
    expect(back[4]).toBe(1);
  });

  it("round-trips PCM16 through little-endian base64", () => {
    const pcm = new Int16Array([0, 1, -1, 12345, -32768, 32767]);
    const b64 = pcm16ToBase64(pcm);
    expect(b64).toBe(Buffer.from(new Uint8Array(pcm.buffer)).toString("base64")); // LE host
    expect(Array.from(base64ToPcm16(b64))).toEqual(Array.from(pcm));
  });
});

describe("mergeTranscript", () => {
  it("accepts both cumulative and delta transcript updates", () => {
    expect(mergeTranscript("", "Can we")).toBe("Can we");
    expect(mergeTranscript("Can we", "Can we raise")).toBe("Can we raise");
    expect(mergeTranscript("Can we raise", "the cut point")).toBe("Can we raise the cut point");
    expect(mergeTranscript("Hello", ".")).toBe("Hello.");
  });
});
