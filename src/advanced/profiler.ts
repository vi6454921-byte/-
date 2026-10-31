/** Bounded ring buffers; percentiles are computed only on demand, not per frame. */
namespace AegisProfiler {
  const rows = new Map<string, { v: Float64Array; n: number; i: number }>();
  export function record(name: string, ms: number) {
    let r = rows.get(name);
    if (!r) {
      r = { v: new Float64Array(360), n: 0, i: 0 };
      rows.set(name, r);
    }
    r.v[r.i++ % r.v.length] = ms;
    r.n = Math.min(r.n + 1, r.v.length);
  }
  export function report() {
    const out: any = {};
    for (const [name, r] of rows) {
      const v = Array.from(r.v.subarray(0, r.n)).sort((a, b) => a - b);
      out[name] = {
        samples: r.n,
        mean: v.reduce((a, b) => a + b, 0) / Math.max(1, r.n),
        p50: v[Math.floor(v.length * 0.5)] || 0,
        p95: v[Math.min(v.length - 1, Math.floor(v.length * 0.95))] || 0,
        max: v.at(-1) || 0,
      };
    }
    return out;
  }
  export function clear() {
    rows.clear();
  }
}
(globalThis as any).GPerf = AegisProfiler;
