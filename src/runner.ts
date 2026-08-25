// Bridge to the Rust side (src-tauri/src/main.rs). This replaces the old
// Pyodide worker: instead of simulating one language inside a WASM sandbox,
// every run now shells out to whatever interpreter/compiler is actually
// installed on the user's machine, the same way a terminal or VS Code does.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface RunFile {
  path: string
  content: string
}

interface OutputPayload {
  stream: 'stdout' | 'stderr'
  data: string
}

interface ExitPayload {
  code: number | null
}

export type RunEvent =
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'exit'; code: number | null }

let unlistenOutput: UnlistenFn | null = null
let unlistenExit: UnlistenFn | null = null

/** Subscribes to output/exit events for the run that's about to start. Call once before startRun(). */
export async function subscribeRunEvents(onEvent: (e: RunEvent) => void): Promise<void> {
  await unsubscribeRunEvents()
  unlistenOutput = await listen<OutputPayload>('run:output', (e) => {
    onEvent({ type: e.payload.stream, data: e.payload.data })
  })
  unlistenExit = await listen<ExitPayload>('run:exit', (e) => {
    onEvent({ type: 'exit', code: e.payload.code })
  })
}

export async function unsubscribeRunEvents(): Promise<void> {
  unlistenOutput?.()
  unlistenOutput = null
  unlistenExit?.()
  unlistenExit = null
}

/**
 * Writes the whole workspace to a temp dir on disk and runs `entry` with the
 * system toolchain for `language`. Throws with a human-readable message if
 * spawning fails (e.g. the interpreter isn't installed) or if a run is
 * already in progress.
 */
export async function startRun(language: string, entry: string, files: RunFile[]): Promise<void> {
  await invoke('run_code', { req: { language, entry, files } })
}

/** Sends one line of stdin to the running process (a trailing newline is added). */
export async function writeStdin(text: string): Promise<void> {
  await invoke('write_stdin', { data: text + '\n' })
}

/** Forcefully terminates the running process (and its child processes). */
export async function stopRun(): Promise<void> {
  await invoke('stop_run')
}

/**
 * Writes the workspace to disk and opens `entry` (an .html file) in the
 * user's default browser — for previewing real web pages, not "running"
 * code through an interpreter.
 */
export async function previewHtml(entry: string, files: RunFile[]): Promise<void> {
  await invoke('preview_html', { req: { entry, files } })
}
