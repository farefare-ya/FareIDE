// Message shapes exchanged between the UI thread and pyodide-worker.ts.
// Kept in one file so both sides stay in sync.

// Shared buffer layout used for interactive input():
//   Int32Array view, index 0 — signal: 0 = worker waiting, 1 = answer ready
//   Int32Array view, index 1 — length (in bytes) of the UTF-8 answer
//   bytes [8, 8+STDIN_MAX_BYTES) — the UTF-8-encoded answer text
export const STDIN_MAX_BYTES = 4096
export const STDIN_BUFFER_BYTES = 8 + STDIN_MAX_BYTES

export interface RunMsg {
  type: 'run'
  code: string
  filename: string
  stdinBuffer: SharedArrayBuffer | null
}

export type WorkerInMsg = RunMsg

export type WorkerOutMsg =
  | { type: 'status'; status: 'loading' | 'ready' }
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'input-request' }
  | { type: 'done'; exitCode: number }
  | { type: 'fatal'; message: string }
