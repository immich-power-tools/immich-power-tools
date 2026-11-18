/**
 * Face clustering engine: single-linkage connected components over the graph
 * where an edge joins two faces iff cosine similarity >= threshold.
 *
 * The O(n^2) similarity pass runs in pure JS on worker_threads over a
 * SharedArrayBuffer, with a 4-way unrolled dot product. Deliberately NOT SQL
 * and NOT a native/WASM dependency:
 *  - SQL was measured on live data (~5.1k-face person, Immich pgvector) at
 *    49s (pairwise self-join) and 183s (per-face LATERAL over the ANN index —
 *    the index can't help inside one person's rows). Unusable.
 *  - This implementation measures ~0.8s for the same person on 8 workers
 *    (M1 Max), matching a numpy BLAS baseline (~0.75s) with zero deps, and
 *    produced bit-identical clusters (same 233,459 edges, 84 clusters /
 *    1,132 singletons at threshold 0.65).
 *
 * The similarity matrix is never materialized: edges above threshold stream
 * into worker-local buffers (233k edges for 5k faces vs a ~100MB matrix).
 */
import os from "node:os";
import { Worker } from "node:worker_threads";

export interface ClusterOptions {
  /** Cosine similarity two faces need to land in one cluster. */
  threshold: number;
  /** Components smaller than this are folded into singletonCount. */
  minClusterSize: number;
  /** Hard ceiling — O(n^2) work; throw rather than melt on a pathological person. */
  maxFaces?: number;
}

export interface ClusterOutput {
  /** Each cluster is a list of row indexes into the caller's face list,
   * largest cluster first. */
  clusters: number[][];
  singletonCount: number;
}

export const DEFAULT_THRESHOLD = 0.65;
export const DEFAULT_MIN_CLUSTER_SIZE = 2;
export const DEFAULT_MAX_FACES = 8000;

// Worker source as a self-contained string: API routes are bundled by Next,
// and an eval-worker avoids having to teach the bundler about a separate
// worker entry file. The code is small and has no imports beyond
// worker_threads itself.
const WORKER_SRC = `
const { parentPort, workerData } = require("node:worker_threads");
const { sab, n, d, threshold, start, step } = workerData;
const M = new Float32Array(sab);
let cap = 1 << 16, len = 0;
let edges = new Int32Array(cap);
const push = (i, j) => {
  if (len + 2 > cap) { cap *= 2; const e2 = new Int32Array(cap); e2.set(edges); edges = e2; }
  edges[len++] = i; edges[len++] = j;
};
// Row-interleaved upper triangle: worker w handles rows w, w+P, w+2P, ...
// which balances the shrinking triangle without cost modeling.
for (let i = start; i < n; i += step) {
  const offI = i * d;
  for (let j = i + 1; j < n; j++) {
    const offJ = j * d;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let k = 0; k < d; k += 4) {
      s0 += M[offI + k]     * M[offJ + k];
      s1 += M[offI + k + 1] * M[offJ + k + 1];
      s2 += M[offI + k + 2] * M[offJ + k + 2];
      s3 += M[offI + k + 3] * M[offJ + k + 3];
    }
    if (s0 + s1 + s2 + s3 >= threshold) push(i, j);
  }
}
const out = edges.slice(0, len);
parentPort.postMessage(out, [out.buffer]);
`;

// One clustering run at a time per process: each run already saturates the
// machine with its own worker pool, so concurrent runs would only thrash.
let queue: Promise<unknown> = Promise.resolve();
function withClusterLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function workerCount(): number {
  return Math.max(1, Math.min(8, os.cpus().length - 2));
}

/**
 * @param embeddings row-major n x d matrix. Rows need NOT be normalized —
 *   normalization happens here so callers can pass raw pgvector values.
 */
export function clusterEmbeddings(
  embeddings: Float32Array,
  n: number,
  d: number,
  opts: ClusterOptions
): Promise<ClusterOutput> {
  const { threshold, minClusterSize, maxFaces = DEFAULT_MAX_FACES } = opts;
  if (n * d !== embeddings.length) {
    throw new Error(`embeddings length ${embeddings.length} != n*d (${n}*${d})`);
  }
  if (n > maxFaces) {
    throw new Error(
      `Too many faces to cluster (${n} > ${maxFaces}) — the similarity pass is O(n^2) in time and memory.`
    );
  }
  return withClusterLock(async () => {
    if (n < 2) return { clusters: [], singletonCount: n };

    // Copy into a SharedArrayBuffer, normalizing each row.
    const sab = new SharedArrayBuffer(n * d * 4);
    const M = new Float32Array(sab);
    for (let i = 0; i < n; i++) {
      const off = i * d;
      let norm = 0;
      for (let k = 0; k < d; k++) norm += embeddings[off + k] * embeddings[off + k];
      norm = Math.sqrt(norm) || 1;
      for (let k = 0; k < d; k++) M[off + k] = embeddings[off + k] / norm;
    }

    const P = workerCount();
    const edgeLists = await Promise.all(
      Array.from({ length: P }, (_, w) =>
        new Promise<Int32Array>((resolve, reject) => {
          const wk = new Worker(WORKER_SRC, {
            eval: true,
            workerData: { sab, n, d, threshold, start: w, step: P },
          });
          wk.once("message", (m: Int32Array) => { resolve(m); void wk.terminate(); });
          wk.once("error", reject);
        })
      )
    );

    // Union-find over the merged edge lists (trivially fast: ~3ms / 233k edges).
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x: number): number => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    for (const list of edgeLists) {
      for (let e = 0; e < list.length; e += 2) {
        const ri = find(list[e]), rj = find(list[e + 1]);
        if (ri !== rj) parent[ri] = rj;
      }
    }

    const members = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      const arr = members.get(r);
      if (arr) arr.push(i);
      else members.set(r, [i]);
    }
    const clusters: number[][] = [];
    let singletonCount = 0;
    for (const group of members.values()) {
      if (group.length >= minClusterSize) clusters.push(group);
      else singletonCount += group.length;
    }
    clusters.sort((a, b) => b.length - a.length);
    return { clusters, singletonCount };
  });
}
