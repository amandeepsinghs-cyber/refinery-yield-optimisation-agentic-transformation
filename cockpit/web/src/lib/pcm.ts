/**
 * PCM helpers for the Gemini Live voice copilot.
 * Mic: Float32 @ context rate → 16 kHz PCM16 mono (little-endian) → base64.
 * Speaker: base64 PCM16 24 kHz → Float32 for AudioBuffer playback.
 */

export const MIC_TARGET_RATE = 16_000;
export const SPEAKER_RATE = 24_000;

/**
 * Downsample by box-averaging (a cheap anti-alias low-pass) over each output
 * sample's source span. For inRate === outRate the input is copied.
 */
export function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate === inRate) return input.slice();
  if (outRate > inRate) throw new Error("downsample: outRate must be <= inRate");
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** Stateful resampler that keeps the fractional remainder between chunks (no clicks). */
export class StreamingDownsampler {
  private carry: Float32Array = new Float32Array(0);
  constructor(
    private inRate: number,
    private outRate: number = MIC_TARGET_RATE,
  ) {}

  process(chunk: Float32Array): Float32Array {
    const joined = new Float32Array(this.carry.length + chunk.length);
    joined.set(this.carry, 0);
    joined.set(chunk, this.carry.length);
    const ratio = this.inRate / this.outRate;
    const outLen = Math.floor(joined.length / ratio);
    const consumed = Math.floor(outLen * ratio);
    const out = downsample(joined.subarray(0, consumed), this.inRate, this.outRate);
    this.carry = joined.slice(consumed);
    return out.length === outLen ? out : out.subarray(0, outLen);
  }
}

export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

export function pcm16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] / (input[i] < 0 ? 0x8000 : 0x7fff);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Int16 → little-endian bytes → base64 (explicit LE, independent of host endianness). */
export function pcm16ToBase64(pcm: Int16Array): string {
  const buf = new ArrayBuffer(pcm.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < pcm.length; i++) view.setInt16(i * 2, pcm[i], true);
  return toBase64(new Uint8Array(buf));
}

export function base64ToPcm16(b64: string): Int16Array {
  const bytes = fromBase64(b64);
  const n = Math.floor(bytes.length / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/** RMS level in [0,1] for the level meter. */
export function rmsLevel(input: Float32Array): number {
  if (!input.length) return 0;
  let s = 0;
  for (let i = 0; i < input.length; i++) s += input[i] * input[i];
  return Math.min(1, Math.sqrt(s / input.length) * 3);
}
