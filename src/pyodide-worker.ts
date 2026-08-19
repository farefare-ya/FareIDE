/// <reference lib="webworker" />

// Runs in a dedicated Worker so a long-running or infinite Python loop never
// freezes the editor UI — worst case, the user hits Stop and we terminate()
// this whole worker (works even mid-infinite-loop, since termination doesn't
// require the worker's JS to cooperate).

import { loadPyodide, version as pyodideVersion, type PyodideInterface } from 'pyodide'
import type { WorkerInMsg, WorkerOutMsg } from './pyodide-protocol'

function post(msg: WorkerOutMsg) {
  ;(self as unknown as { postMessage: (m: WorkerOutMsg) => void }).postMessage(msg)
}

let pyodide: PyodideInterface | null = null
let loadingPromise: Promise<PyodideInterface> | null = null

async function ensurePyodide(): Promise<PyodideInterface> {
  if (pyodide) return pyodide
  if (!loadingPromise) {
    post({ type: 'status', status: 'loading' })
    loadingPromise = loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`,
      stdout: (msg) => post({ type: 'stdout', data: msg + '\n' }),
      stderr: (msg) => post({ type: 'stderr', data: msg + '\n' }),
    }).then((py) => {
      // No real stdin in a worker — make input() fail fast with a clear
      // error instead of hanging forever waiting for a line that never comes.
      py.setStdin({ error: true })
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

  try {
    const py = await ensurePyodide()
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
      } else if (/stdin/i.test(text) && /(EOFError|error: true)/i.test(text)) {
        post({ type: 'stderr', data: 'input() belum didukung di terminal browser ini.\n' })
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
