/// <reference lib="webworker" />

// Runs in a dedicated Worker so a long-running or infinite Python loop never
// freezes the editor UI — worst case, the user hits Stop and we terminate()
// this whole worker (works even mid-infinite-loop, since termination doesn't
// require the worker's JS to cooperate).

import { loadPyodide, version as pyodideVersion, type PyodideInterface } from 'pyodide'
import type { WorkerInMsg, WorkerOutMsg } from './pyodide-protocol'
import { STDIN_MAX_BYTES } from './pyodide-protocol'

function post(msg: WorkerOutMsg) {
  ;(self as unknown as { postMessage: (m: WorkerOutMsg) => void }).postMessage(msg)
}

let pyodide: PyodideInterface | null = null
let loadingPromise: Promise<PyodideInterface> | null = null

// Reading a line of input() blocks this worker thread with Atomics.wait until
// the main thread writes an answer into the shared buffer and notifies us.
// This only works when the page is cross-origin isolated (see vite.config.ts,
// public/_headers, vercel.json) — crossOriginIsolated is checked on the main
// thread before a SharedArrayBuffer is even created; if it's not available we
// fall back to failing fast on input() (see the null-buffer branch below).
function makeStdinHandler(stdinBuffer: SharedArrayBuffer | null) {
  return () => {
    if (!stdinBuffer) {
      throw new Error('input() is not available: this page is not cross-origin isolated.')
    }
    post({ type: 'input-request' })
    const control = new Int32Array(stdinBuffer, 0, 2)
    Atomics.store(control, 0, 0)
    Atomics.wait(control, 0, 0) // blocks the whole worker thread — that's the point
    const len = Math.min(control[1], STDIN_MAX_BYTES)
    const bytes = new Uint8Array(stdinBuffer, 8, len)
    return new TextDecoder().decode(bytes)
  }
}

async function ensurePyodide(): Promise<PyodideInterface> {
  if (pyodide) return pyodide
  if (!loadingPromise) {
    post({ type: 'status', status: 'loading' })
    loadingPromise = loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`,
      stdout: (msg) => post({ type: 'stdout', data: msg + '\n' }),
      stderr: (msg) => post({ type: 'stderr', data: msg + '\n' }),
    }).then((py) => {
      pyodide = py
      post({ type: 'status', status: 'ready' })
      return py
    })
  }
  return loadingPromise
}

function formatPyError(err: unknown): string {
  const text = String(err)
  const idx = text.indexOf('Traceback')
  return (idx >= 0 ? text.slice(idx) : text) + '\n'
}

self.onmessage = async (e: MessageEvent<WorkerInMsg>) => {
  const msg = e.data
  if (msg.type !== 'run') return

  const noStdinAvailable = !msg.stdinBuffer

  try {
    const py = await ensurePyodide()
    py.setStdin({ stdin: makeStdinHandler(msg.stdinBuffer) })
    try {
      await py.loadPackagesFromImports(msg.code, {
        messageCallback: (m) => post({ type: 'stdout', data: m + '\n' }),
        errorCallback: (m) => post({ type: 'stderr', data: m + '\n' }),
      })
      await py.runPythonAsync(msg.code, { filename: msg.filename })
      post({ type: 'done', exitCode: 0 })
    } catch (err) {
      const text = String(err)
      const sysExit = text.match(/SystemExit:\s*(-?\d+)?/)
      if (sysExit) {
        post({ type: 'done', exitCode: sysExit[1] ? parseInt(sysExit[1], 10) : 0 })
      } else if (noStdinAvailable && /(OSError|EOFError|I\/O error|Errno 29)/i.test(text)) {
        // Pyodide's C-level stdio layer wraps whatever our stdin() callback
        // throws into a generic OSError — the original message doesn't
        // survive, so we lean on the fact we already knew: no SharedArrayBuffer
        // was handed to this run, so any I/O failure here is that.
        post({ type: 'stderr', data: 'input() failed: this page is not cross-origin isolated, so interactive input is unavailable in this environment.\n' })
        post({ type: 'done', exitCode: 1 })
      } else {
        post({ type: 'stderr', data: formatPyError(err) })
        post({ type: 'done', exitCode: 1 })
      }
    }
  } catch (err) {
    post({ type: 'fatal', message: err instanceof Error ? err.message : String(err) })
  }
}
