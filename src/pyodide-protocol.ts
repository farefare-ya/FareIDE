// Message shapes exchanged between the UI thread and pyodide-worker.ts.
// Kept in one file so both sides stay in sync.

export interface RunMsg {
  type: 'run'
  code: string
  filename: string
}

export type WorkerInMsg = RunMsg

export type WorkerOutMsg =
  | { type: 'status'; status: 'loading' | 'ready' }
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'done'; exitCode: number }
  | { type: 'fatal'; message: string }
