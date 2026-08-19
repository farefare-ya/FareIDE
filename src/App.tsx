import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import JSZip from 'jszip'
import { getLang, getLangLabel } from './syntax'
import type { WorkerOutMsg } from './pyodide-protocol'

import CodeMirror from '@uiw/react-codemirror'
import { EditorView, keymap } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting, StreamLanguage } from '@codemirror/language'
import { snippetCompletion, completeFromList, type Completion } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'

import { html, htmlLanguage } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
import { python, pythonLanguage } from '@codemirror/lang-python'
import { php, phpLanguage } from '@codemirror/lang-php'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { cpp, cppLanguage } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { go as goMode } from '@codemirror/legacy-modes/mode/go'

// ── CodeMirror theme — colors come from CSS variables so light/dark just work ──

function getFareideEditorTheme(isDark: boolean) {
  return EditorView.theme({
    '&': { backgroundColor: 'transparent', color: 'var(--text-primary)', height: '100%', fontSize: '13.5px' },
    '.cm-content': { fontFamily: "'JetBrains Mono', monospace", caretColor: 'var(--accent-soft)', padding: '16px 0' },
    '.cm-line': { padding: '0 16px' },
    '.cm-scroller': { fontFamily: "'JetBrains Mono', monospace", lineHeight: '22px' },
    '.cm-gutters': { backgroundColor: 'var(--bg-app)', color: 'var(--text-dim)', border: 'none', borderRight: '1px solid var(--border)' },
    '.cm-gutterElement': { padding: '0 12px 0 16px' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-secondary)' },
    '.cm-activeLine': { backgroundColor: 'var(--overlay-hover)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-select) !important' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-soft)' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': { backgroundColor: 'var(--accent-active)', outline: '1px solid var(--accent-outline)' },
    '.cm-tooltip': { backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: '8px', overflow: 'hidden' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent-active)', color: 'var(--accent-soft)' },
    '.cm-tooltip-autocomplete ul li': { padding: '3px 10px' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--border)', border: 'none', color: 'var(--text-secondary)' },
  }, { dark: isDark })
}

const fareideHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-function)' },
  { tag: [t.className, t.typeName], color: 'var(--syn-type)' },
  { tag: [t.operator, t.punctuation, t.angleBracket], color: 'var(--syn-operator)' },
  { tag: t.propertyName, color: 'var(--syn-function)' },
  { tag: t.attributeName, color: 'var(--syn-type)' },
  { tag: t.attributeValue, color: 'var(--syn-string)' },
  { tag: t.tagName, color: 'var(--syn-tag)' },
  { tag: t.variableName, color: 'var(--syn-text)' },
  { tag: t.meta, color: 'var(--syn-tag)' },
  { tag: t.invalid, color: 'var(--danger)' },
])

function getFareideTheme(isDark: boolean): Extension[] {
  return [getFareideEditorTheme(isDark), syntaxHighlighting(fareideHighlightStyle)]
}

// ── Structural snippets (Tab-triggered, multi-tabstop via CodeMirror's own engine) ──

const htmlSnippets = [
  snippetCompletion(
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${Document}</title>\n</head>\n<body>\n  ${}\n</body>\n</html>',
    { label: '!', detail: 'HTML5 boilerplate', type: 'keyword' },
  ),
  snippetCompletion(
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${Document}</title>\n</head>\n<body>\n  ${}\n</body>\n</html>',
    { label: 'doctype', detail: 'HTML5 boilerplate', type: 'keyword' },
  ),
]

const pySnippets = [
  snippetCompletion('def ${name}(${params}):\n    ${}', { label: 'def', detail: 'function', type: 'keyword' }),
  snippetCompletion('class ${Name}:\n    def __init__(self${, params}):\n        ${}', { label: 'class', detail: 'class', type: 'keyword' }),
  snippetCompletion('for ${i} in range(${n}):\n    ${}', { label: 'for', detail: 'loop', type: 'keyword' }),
  snippetCompletion('if ${condition}:\n    ${}', { label: 'if', detail: 'conditional', type: 'keyword' }),
  snippetCompletion('try:\n    ${}\nexcept ${Exception} as e:\n    ${}', { label: 'try', detail: 'try/except', type: 'keyword' }),
]

// CodeMirror's built-in Python support only completes keywords + local names — it has
// no type inference, so it can't know a variable is a `str` vs `list` the way a real
// language server (Pyright/Jedi) would. This is a plain name list to at least surface
// common str/list/dict/set method names (maketrans, translate, etc.) by spelling, not by type.
const pyBuiltinMethodNames = [
  'capitalize', 'casefold', 'center', 'count', 'encode', 'endswith', 'expandtabs', 'find', 'format', 'format_map',
  'index', 'isalnum', 'isalpha', 'isascii', 'isdecimal', 'isdigit', 'isidentifier', 'islower', 'isnumeric',
  'isprintable', 'isspace', 'istitle', 'isupper', 'join', 'ljust', 'lower', 'lstrip', 'maketrans', 'partition',
  'removeprefix', 'removesuffix', 'replace', 'rfind', 'rindex', 'rjust', 'rpartition', 'rsplit', 'rstrip',
  'split', 'splitlines', 'startswith', 'strip', 'swapcase', 'title', 'translate', 'upper', 'zfill',
  'append', 'clear', 'copy', 'extend', 'insert', 'pop', 'remove', 'reverse', 'sort',
  'get', 'items', 'keys', 'popitem', 'setdefault', 'update', 'values', 'fromkeys',
  'add', 'difference', 'discard', 'intersection', 'isdisjoint', 'issubset', 'issuperset',
  'symmetric_difference', 'union',
]
const pyMethodCompletions: Completion[] = Array.from(new Set(pyBuiltinMethodNames)).map((name) => ({ label: name, type: 'method' }))

const jsSnippets = [
  snippetCompletion('function ${name}(${params}) {\n  ${}\n}', { label: 'function', detail: 'function', type: 'keyword' }),
  snippetCompletion('class ${Name} {\n  constructor(${params}) {\n    ${}\n  }\n}', { label: 'class', detail: 'class', type: 'keyword' }),
  snippetCompletion('for (let ${i} = 0; ${i} < ${n}; ${i}++) {\n  ${}\n}', { label: 'for', detail: 'loop', type: 'keyword' }),
  snippetCompletion('if (${condition}) {\n  ${}\n}', { label: 'if', detail: 'conditional', type: 'keyword' }),
]

const phpSnippets = [
  snippetCompletion('function ${name}(${params}) {\n    ${}\n}', { label: 'function', detail: 'function', type: 'keyword' }),
  snippetCompletion('if (${condition}) {\n    ${}\n}', { label: 'if', detail: 'conditional', type: 'keyword' }),
  snippetCompletion('foreach (${$arr} as ${$value}) {\n    ${}\n}', { label: 'foreach', detail: 'loop', type: 'keyword' }),
]

const cppSnippets = [
  snippetCompletion('#include <${iostream}>', { label: 'include', detail: 'header include', type: 'keyword' }),
  snippetCompletion('int main() {\n    ${}\n    return 0;\n}', { label: 'main', detail: 'entry point', type: 'keyword' }),
  snippetCompletion('for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n    ${}\n}', { label: 'for', detail: 'loop', type: 'keyword' }),
  snippetCompletion('if (${condition}) {\n    ${}\n}', { label: 'if', detail: 'conditional', type: 'keyword' }),
  snippetCompletion('void ${name}(${params}) {\n    ${}\n}', { label: 'function', detail: 'function', type: 'keyword' }),
  snippetCompletion('class ${Name} {\npublic:\n    ${Name}(${params}) {\n        ${}\n    }\n};', { label: 'class', detail: 'class', type: 'keyword' }),
  snippetCompletion('struct ${Name} {\n    ${}\n};', { label: 'struct', detail: 'struct', type: 'keyword' }),
]

// ── Language + snippet resolution per file path ────────────────────────────────

function getEditorExtensions(path: string): Extension[] {
  const lang = getLang(path)
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const base: Extension[] = [keymap.of([indentWithTab])]

  switch (lang) {
    case 'html':
      return [...base, html({ autoCloseTags: true, matchClosingTags: true }), htmlLanguage.data.of({ autocomplete: completeFromList(htmlSnippets) })]
    case 'css':
      return [...base, css()]
    case 'javascript':
      return [...base, javascript({ jsx: ext === 'jsx' }), javascriptLanguage.data.of({ autocomplete: completeFromList(jsSnippets) })]
    case 'typescript':
      return [...base, javascript({ jsx: ext === 'tsx', typescript: true }), javascriptLanguage.data.of({ autocomplete: completeFromList(jsSnippets) })]
    case 'python':
      return [...base, python(), pythonLanguage.data.of({ autocomplete: completeFromList([...pySnippets, ...pyMethodCompletions]) })]
    case 'php':
      return [...base, php(), phpLanguage.data.of({ autocomplete: completeFromList(phpSnippets) })]
    case 'json':
      return [...base, json()]
    case 'markdown':
      return [...base, markdown()]
    case 'xml':
      return [...base, xml()]
    case 'cpp':
      return [...base, cpp(), cppLanguage.data.of({ autocomplete: completeFromList(cppSnippets) })]
    case 'java':
      return [...base, java()]
    case 'rust':
      return [...base, rust()]
    case 'sql':
      return [...base, sql()]
    case 'yaml':
      return [...base, yaml()]
    case 'bash':
      return [...base, StreamLanguage.define(shell)]
    case 'go':
      return [...base, StreamLanguage.define(goMode)]
    default:
      return base
  }
}
// ── Types ─────────────────────────────────────────────────────────────────────

type FileSystem = Record<string, string>

interface Tab {
  path: string
  dirty: boolean
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTree(fs: FileSystem): TreeNode[] {
  const dirs = new Set<string>()
  Object.keys(fs).forEach((p) => {
    const parts = p.split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  })

  const nodeMap: Record<string, TreeNode> = {}
  const roots: TreeNode[] = []

  const allDirs = [...dirs].sort().map((p) => ({ path: p, isDir: true, name: p.split('/').pop()! }))
  const allFiles = Object.keys(fs).filter((p) => !p.endsWith('/.keep')).sort().map((p) => ({ path: p, isDir: false, name: p.split('/').pop()! }))

  const insert = (path: string, isDir: boolean, name: string) => {
    const node: TreeNode = { name, path, isDir, children: [] }
    nodeMap[path] = node
    const parts = path.split('/')
    if (parts.length === 1) { roots.push(node); return }
    const parentPath = parts.slice(0, -1).join('/')
    nodeMap[parentPath]?.children.push(node)
  }

  allDirs.forEach(({ path, isDir, name }) => insert(path, isDir, name))
  allFiles.forEach(({ path, isDir, name }) => insert(path, isDir, name))

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

function downloadFile(name: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

async function downloadZip(fs: FileSystem) {
  const zip = new JSZip()
  Object.entries(fs).forEach(([p, c]) => zip.file(p, c))
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'project.zip'; a.click()
  URL.revokeObjectURL(url)
}

// ── Icons (SVG, no emoji) ─────────────────────────────────────────────────────

function IconFolder({ open }: { open?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
      {open ? (
        <path d="M1 3.5C1 2.67 1.67 2 2.5 2H6l1.5 2H14c.55 0 1 .45 1 1v7c0 .55-.45 1-1 1H2.5C1.67 13 1 12.33 1 11.5V3.5Z" fill="var(--accent)" opacity=".7"/>
      ) : (
        <path d="M1 3.5C1 2.67 1.67 2 2.5 2H6l1.5 2H13.5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-11C1.67 13 1 12.33 1 11.5V3.5Z" fill="var(--text-dim)" opacity=".8"/>
      )}
    </svg>
  )
}

function IconFile({ lang }: { lang: string | null }) {
  const colors: Record<string, string> = {
    python: '#3b82f6', html: '#f97316', css: '#a855f7',
    javascript: '#eab308', typescript: '#3b82f6', php: '#8b5cf6',
    json: 'var(--text-secondary)', bash: '#10b981', sql: '#06b6d4',
    rust: '#f97316', go: '#06b6d4', java: '#ef4444',
    cpp: '#3b82f6', markdown: '#9ca3af', yaml: '#f59e0b', xml: '#f97316',
  }
  const color = lang ? (colors[lang] ?? 'var(--text-secondary)') : 'var(--text-secondary)'
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M3 1h7l4 4v10H3V1Z" fill={color} opacity=".15" stroke={color} strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M10 1l4 4h-4V1Z" fill={color} opacity=".4"/>
      <path d="M5 8h6M5 10.5h4" stroke={color} strokeWidth="1.1" strokeLinecap="round" opacity=".7"/>
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M3 2l4 3-4 3" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Tree item ─────────────────────────────────────────────────────────────────

function TreeItem({
  node, depth, selected, onSelect, onContextMenu,
}: {
  node: TreeNode; depth: number; selected: string | null
  onSelect: (p: string, isDir: boolean) => void
  onContextMenu: (e: React.MouseEvent, p: string, isDir: boolean) => void
}) {
  const [open, setOpen] = useState(true)
  const isSelected = selected === node.path
  const lang = node.isDir ? null : getLang(node.name)

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-[3px] pr-2 cursor-pointer select-none text-[12.5px] rounded-sm transition-colors ${
          isSelected ? 'bg-[var(--accent-wash)] text-[var(--accent-soft)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--overlay-hover)]'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => { if (node.isDir) setOpen((o) => !o); onSelect(node.path, node.isDir) }}
        onContextMenu={(e) => onContextMenu(e, node.path, node.isDir)}
      >
        {node.isDir
          ? <IconFolder open={open} />
          : <IconFile lang={lang} />}
        <span className="truncate flex-1">{node.name}</span>
        {node.isDir && <IconChevron open={open} />}
      </div>
      {node.isDir && open && node.children.map((child) => (
        <TreeItem key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} onContextMenu={onContextMenu} />
      ))}
    </div>
  )
}

// ── Syntax-highlighted editor ─────────────────────────────────────────────────

function CodeEditor({ content, onChange, path, isDark }: {
  content: string; onChange: (v: string) => void; path: string; isDark: boolean
}) {
  const extensions = useMemo(() => getEditorExtensions(path), [path])
  const cmTheme = useMemo(() => getFareideTheme(isDark), [isDark])

  return (
    <CodeMirror
      value={content}
      onChange={onChange}
      theme={cmTheme}
      extensions={extensions}
      height="100%"
      basicSetup={{ tabSize: 2, highlightActiveLine: true, foldGutter: true }}
      style={{ height: '100%' }}
      className="h-full"
    />
  )
}

// ── Terminal panel ───────────────────────────────────────────────────────────

function TerminalPanel({ lines, status, running, onClose, onClear, onStop }: {
  lines: { kind: 'stdout' | 'stderr' | 'info'; text: string }[]
  status: 'idle' | 'loading' | 'ready'
  running: boolean
  onClose: () => void
  onClear: () => void
  onStop: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [lines])

  const statusLabel = running
    ? (status === 'loading' ? 'Memuat runtime…' : 'Berjalan…')
    : status === 'ready' ? 'Python siap' : 'Belum dimuat'

  return (
    <div className="h-56 shrink-0 flex flex-col border-t border-[var(--border)] bg-[var(--bg-app)]">
      <div className="flex items-center justify-between h-8 px-3 border-b border-[var(--border)] bg-[var(--bg-panel)] shrink-0">
        <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--text-secondary)]">
          <span>Terminal</span>
          <span className={`flex items-center gap-1 ${running ? 'text-[var(--accent-soft)]' : 'text-[var(--text-dim)]'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-[var(--accent)] animate-pulse' : status === 'ready' ? 'bg-[var(--success)]' : 'bg-[var(--text-dim)]'}`} />
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {running && (
            <button onClick={onStop} title="Hentikan"
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--danger)] hover:bg-[var(--danger-wash)] transition-colors">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1"/></svg>
            </button>
          )}
          <button onClick={onClear} title="Bersihkan"
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--accent-soft)] hover:bg-[var(--accent-wash)] transition-colors">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0"/><rect x="2" y="4" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M2 4l1.2-2h7.6L12 4M6 6.5v3M8 6.5v3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
          </button>
          <button onClick={onClose} title="Tutup"
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--overlay-hover)] transition-colors">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12.5px', lineHeight: '18px' }}>
        {lines.length === 0 ? (
          <p className="text-[var(--text-dim)]">Belum ada output. Buka file .py lalu klik Run.</p>
        ) : (
          <pre className="whitespace-pre-wrap break-words m-0">
            {lines.map((l, i) => (
              <span key={i} className={
                l.kind === 'stderr' ? 'text-[var(--danger)]' : l.kind === 'info' ? 'text-[var(--text-dim)] italic' : 'text-[var(--text-primary)]'
              }>{l.text}</span>
            ))}
          </pre>
        )}
      </div>
    </div>
  )
}

// ── Context menu ───────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; path: string; isDir: boolean }

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [fs, setFs] = useState<FileSystem>({})
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<string>('')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  // ── Python execution (Pyodide, in a Worker) ──────────────────────────────
  type TermLine = { kind: 'stdout' | 'stderr' | 'info'; text: string }
  const [showTerminal, setShowTerminal] = useState(false)
  const [termLines, setTermLines] = useState<TermLine[]>([])
  const [pyStatus, setPyStatus] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [running, setRunning] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  const appendTerm = useCallback((kind: TermLine['kind'], text: string) => {
    setTermLines((prev) => [...prev, { kind, text }])
  }, [])

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current
    const w = new Worker(new URL('./pyodide-worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<WorkerOutMsg>) => {
      const msg = e.data
      if (msg.type === 'status') {
        setPyStatus(msg.status)
        if (msg.status === 'loading') appendTerm('info', 'Memuat Python runtime (Pyodide)…\n')
      } else if (msg.type === 'stdout') {
        appendTerm('stdout', msg.data)
      } else if (msg.type === 'stderr') {
        appendTerm('stderr', msg.data)
      } else if (msg.type === 'done') {
        setRunning(false)
        appendTerm('info', `\n[selesai — exit code ${msg.exitCode}]\n`)
      } else if (msg.type === 'fatal') {
        setRunning(false)
        setPyStatus('idle')
        appendTerm('stderr', `Gagal memuat Python runtime: ${msg.message}\n`)
      }
    }
    workerRef.current = w
    return w
  }, [appendTerm])

  const runActiveFile = useCallback(() => {
    if (!activeTab || getLang(activeTab) !== 'python' || running) return
    setShowTerminal(true)
    setRunning(true)
    appendTerm('info', `$ python ${activeTab.split('/').pop()}\n`)
    getWorker().postMessage({ type: 'run', code: fs[activeTab] ?? '', filename: activeTab.split('/').pop() ?? activeTab })
  }, [activeTab, running, fs, getWorker, appendTerm])

  const stopRun = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setRunning(false)
    setPyStatus('idle')
    appendTerm('info', '\n[dihentikan]\n')
  }, [appendTerm])

  useEffect(() => () => { workerRef.current?.terminate() }, [])
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [modal, setModal] = useState<{ type: 'newFile' | 'newFolder' | 'rename'; path?: string } | null>(null)
  const [modalInput, setModalInput] = useState('')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)

  const flash = (msg: string) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(null), 2500) }

  const openFile = useCallback((path: string) => {
    setActiveTab(path)
    setTabs((prev) => prev.find((t) => t.path === path) ? prev : [...prev, { path, dirty: false }])
  }, [])

  const closeTab = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTabs((prev) => {
      const next = prev.filter((t) => t.path !== path)
      if (activeTab === path) {
        const idx = prev.findIndex((t) => t.path === path)
        setActiveTab(next[Math.max(0, idx - 1)]?.path ?? '')
      }
      return next
    })
  }

  const updateContent = (path: string, value: string) => {
    setFs((prev) => ({ ...prev, [path]: value }))
    setTabs((prev) => prev.map((t) => t.path === path ? { ...t, dirty: true } : t))
  }

  const saveActive = useCallback(() => {
    if (!activeTab) return
    setTabs((prev) => prev.map((t) => t.path === activeTab ? { ...t, dirty: false } : t))
    flash(`Saved ${activeTab.split('/').pop()}`)
  }, [activeTab])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveActive() } }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [saveActive])

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const entries: FileSystem = {}
    for (const f of files) entries[f.name] = await f.text()
    setFs((prev) => ({ ...prev, ...entries }))
    flash(`Uploaded ${files.length} file(s)`)
    e.target.value = ''
  }

  const handleUploadZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const zip = await JSZip.loadAsync(file)
      const entries: FileSystem = {}
      const tasks: Promise<void>[] = []
      zip.forEach((rel, entry) => {
        if (!entry.dir) tasks.push(entry.async('string').then((c) => { entries[rel] = c }))
      })
      await Promise.all(tasks)
      setFs((prev) => ({ ...prev, ...entries }))
      flash(`Extracted ${Object.keys(entries).length} file(s) from ZIP`)
    } catch { flash('Failed to read ZIP') }
    e.target.value = ''
  }

  const handleModalConfirm = () => {
    if (!modal) return
    const value = modalInput.trim()
    if (!value) return
    if (modal.type === 'newFile') {
      const dirPath = selectedNode && !fs[selectedNode] ? selectedNode + '/' : ''
      const fullPath = dirPath + value
      setFs((prev) => ({ ...prev, [fullPath]: '' }))
      openFile(fullPath)
    } else if (modal.type === 'newFolder') {
      const dirPath = selectedNode && !fs[selectedNode] ? selectedNode + '/' : ''
      setFs((prev) => ({ ...prev, [dirPath + value + '/.keep']: '' }))
    } else if (modal.type === 'rename' && modal.path) {
      const old = modal.path
      const parts = old.split('/'); parts[parts.length - 1] = value
      const next = parts.join('/')
      setFs((prev) => {
        const n: FileSystem = {}
        Object.entries(prev).forEach(([k, v]) => {
          if (k === old) n[next] = v
          else if (k.startsWith(old + '/')) n[next + k.slice(old.length)] = v
          else n[k] = v
        })
        return n
      })
      setTabs((prev) => prev.map((t) => {
        if (t.path === old) return { ...t, path: next }
        if (t.path.startsWith(old + '/')) return { ...t, path: next + t.path.slice(old.length) }
        return t
      }))
      if (activeTab === old || activeTab.startsWith(old + '/')) setActiveTab(activeTab.replace(old, next))
    }
    setModal(null); setModalInput('')
  }

  const handleDeleteNode = (path: string, isDir: boolean) => {
    setFs((prev) => {
      const n = { ...prev }
      if (isDir) Object.keys(n).forEach((k) => { if (k === path || k.startsWith(path + '/')) delete n[k] })
      else delete n[path]
      return n
    })
    setTabs((prev) => {
      const n = isDir ? prev.filter((t) => t.path !== path && !t.path.startsWith(path + '/')) : prev.filter((t) => t.path !== path)
      if (!n.find((t) => t.path === activeTab)) setActiveTab(n[0]?.path ?? '')
      return n
    })
    setCtxMenu(null)
  }

  const tree = buildTree(fs)
  const activeContent = activeTab ? (fs[activeTab] ?? '') : ''

  return (
    <div data-theme={theme} className="flex flex-col h-screen bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden select-none" onClick={() => setCtxMenu(null)}>

      {/* Title bar */}
      <div className="flex items-center justify-between h-10 px-4 bg-[var(--bg-panel)] border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold tracking-tight">
            <span className="text-[var(--accent)]">Fare</span>
            <span className="text-[var(--text-primary)]">IDE</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme((th) => th === 'dark' ? 'light' : 'dark')}
            className="w-7 h-7 flex items-center justify-center rounded bg-[var(--bg-control)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-soft)] border border-[var(--border-soft)] transition-colors text-[var(--text-secondary)]">
            {theme === 'dark' ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.5A6 6 0 016.5 2.5a6 6 0 108 8.5c-.32.06-.66.1-1 .1a6 6 0 01-4.7-2.6z" fill="currentColor"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6L3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            )}
          </button>
          <button onClick={running ? stopRun : runActiveFile}
            disabled={!running && (!activeTab || getLang(activeTab) !== 'python')}
            title={!activeTab || getLang(activeTab) !== 'python' ? 'Buka file .py untuk menjalankan' : running ? 'Hentikan' : 'Jalankan'}
            className={`flex items-center gap-1.5 px-3 py-1 text-[12px] rounded border transition-colors disabled:opacity-30 ${
              running
                ? 'bg-[var(--danger-wash)] text-[var(--danger)] border-[var(--danger)] hover:bg-[var(--danger)] hover:text-white'
                : 'bg-[var(--bg-control)] text-[var(--text-secondary)] border-[var(--border-soft)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-soft)]'
            }`}>
            {running ? (
              <>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1"/></svg>
                Stop
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1.3v7.4a.6.6 0 00.92.5l6-3.7a.6.6 0 000-1L2.92.8A.6.6 0 002 1.3z"/></svg>
                Run
              </>
            )}
          </button>
          <button title="Terminal" onClick={() => setShowTerminal((s) => !s)}
            className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
              showTerminal ? 'bg-[var(--accent-wash)] text-[var(--accent-soft)] border-[var(--accent-select)]' : 'bg-[var(--bg-control)] text-[var(--text-secondary)] border-[var(--border-soft)] hover:text-[var(--accent-soft)] hover:bg-[var(--accent-wash)]'
            }`}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6.5l2.5 2-2.5 2M8 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={() => { if (activeTab && activeTab in fs) { downloadFile(activeTab.split('/').pop()!, fs[activeTab]); flash('Downloaded') } }}
            disabled={!activeTab}
            className="flex items-center gap-1.5 px-3 py-1 text-[12px] rounded bg-[var(--bg-control)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-soft)] border border-[var(--border-soft)] transition-colors disabled:opacity-30 text-[var(--text-secondary)]">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5.5l3 3 3-3M1 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Download
          </button>
          <button onClick={() => downloadZip(fs)}
            className="flex items-center gap-1.5 px-3 py-1 text-[12px] rounded bg-[var(--bg-control)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-soft)] border border-[var(--border-soft)] transition-colors text-[var(--text-secondary)]">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4 4h4M4 6.5h4M4 9h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
            Export ZIP
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-56 bg-[var(--bg-panel)] border-r border-[var(--border)] flex flex-col shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[10.5px] font-semibold uppercase tracking-widest text-[var(--text-dim)]">Explorer</span>
            <div className="flex gap-0.5">
              <button title="New File" onClick={() => { setModal({ type: 'newFile' }); setModalInput('') }}
                className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--accent-soft)] hover:bg-[var(--accent-wash)] transition-colors">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 2h6l3 3v7H2V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 2v3h3M5 7h4M5 9.5h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><path d="M10.5 9v4M8.5 11h4" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
              <button title="New Folder" onClick={() => { setModal({ type: 'newFolder' }); setModalInput('') }}
                className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--accent-soft)] hover:bg-[var(--accent-wash)] transition-colors">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 3.5C1 2.67 1.67 2 2.5 2H5.5l1.5 2H11.5C12.33 4 13 4.67 13 5.5v5c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5V3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M7 6.5v3M5.5 8h3" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 p-2 border-b border-[var(--border)]">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUploadFiles} />
            <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={handleUploadZip} />
            <button onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded bg-[var(--bg-control)] hover:bg-[var(--accent-wash)] text-[var(--text-secondary)] hover:text-[var(--accent-soft)] border border-[var(--border-soft)] transition-colors">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 9V2M3 4.5L6 2l3 2.5M1 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Upload
            </button>
            <button onClick={() => zipInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded bg-[var(--bg-control)] hover:bg-[var(--accent-wash)] text-[var(--text-secondary)] hover:text-[var(--accent-soft)] border border-[var(--border-soft)] transition-colors">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4 1v4M8 1v4M4 5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
              ZIP
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
            {tree.length === 0 && (
              <div className="px-4 py-8 text-center text-[11px] text-[var(--text-dim)]">No files yet.<br />Upload or create one.</div>
            )}
            {tree.map((node) => (
              <TreeItem key={node.path} node={node} depth={0} selected={selectedNode}
                onSelect={(p, isDir) => { setSelectedNode(p); if (!isDir) openFile(p) }}
                onContextMenu={(e, p, isDir) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, path: p, isDir }) }} />
            ))}
          </div>
        </aside>

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Tab bar */}
          <div className="flex items-end h-9 bg-[var(--bg-panel)] border-b border-[var(--border)] overflow-x-auto shrink-0 scrollbar-none">
            {tabs.map((tab) => {
              const isActive = tab.path === activeTab
              const name = tab.path.split('/').pop()!
              const lang = getLang(name)
              return (
                <button key={tab.path} onClick={() => setActiveTab(tab.path)}
                  className={`group flex items-center gap-2 px-3 h-full text-[12.5px] border-r border-[var(--border)] transition-colors shrink-0 max-w-[200px] ${
                    isActive ? 'bg-[var(--bg-app)] text-[var(--text-primary)] border-t border-t-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)] hover:bg-[var(--overlay-hover)]'
                  }`}>
                  <IconFile lang={lang} />
                  <span className="truncate">{name}</span>
                  {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />}
                  <span onClick={(e) => closeTab(tab.path, e)}
                    className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-[var(--danger)] transition-opacity text-[11px]">
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Editor + Terminal */}
          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab && activeTab in fs ? (
              <div className="flex-1 min-h-0 overflow-hidden select-text">
                <CodeEditor key={activeTab} path={activeTab} content={activeContent} onChange={(v) => updateContent(activeTab, v)} isDark={theme === 'dark'} />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity={0.08}><rect x="4" y="4" width="40" height="40" rx="6" stroke="var(--text-primary)" strokeWidth="2"/><path d="M16 18l-6 6 6 6M32 18l6 6-6 6M28 14l-8 20" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div className="text-center">
                  <p className="text-[18px] font-semibold text-[var(--border-soft)]">FareIDE</p>
                  <p className="text-[12px] text-[var(--text-dim)] mt-1">Open a file from the explorer or create a new one</p>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setModal({ type: 'newFile' }); setModalInput('') }}
                    className="px-4 py-2 text-[12px] rounded-lg bg-[var(--accent-wash)] text-[var(--accent-soft)] border border-[var(--accent-select)] hover:bg-[var(--accent-active)] transition-colors">
                    New File
                  </button>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 text-[12px] rounded-lg bg-[var(--bg-control)] text-[var(--text-secondary)] border border-[var(--border-soft)] hover:text-[var(--accent-soft)] hover:bg-[var(--accent-wash)] transition-colors">
                    Upload File
                  </button>
              </div>
            </div>
          )}

          {/* Terminal */}
          {showTerminal && (
            <TerminalPanel
              lines={termLines}
              status={pyStatus}
              running={running}
              onClose={() => setShowTerminal(false)}
              onClear={() => setTermLines([])}
              onStop={stopRun}
            />
          )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between h-6 px-4 bg-[var(--accent)] shrink-0">
        <div className="flex items-center gap-2 text-[11px] text-[var(--accent-on-solid)]">
          <span className="font-semibold text-white">FareIDE</span>
          {activeTab && <><span className="opacity-40">›</span><span className="opacity-70 truncate max-w-[300px]">{activeTab}</span></>}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--accent-on-solid)]">
          {statusMsg
            ? <span className="text-white font-medium">{statusMsg}</span>
            : activeTab && <span className="opacity-60">{getLangLabel(activeTab)}</span>}
          <span className="opacity-50">{Object.keys(fs).length} files</span>
          <span className="opacity-50">Ctrl+S save</span>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="fixed z-50 bg-[var(--bg-elevated)] border border-[var(--border-soft)] rounded-xl shadow-2xl py-1.5 min-w-[156px] text-[12.5px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}>
          {!ctxMenu.isDir && (
            <button className="w-full text-left px-4 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--accent-wash)] hover:text-[var(--text-primary)] transition-colors"
              onClick={() => { openFile(ctxMenu.path); setCtxMenu(null) }}>Open</button>
          )}
          <button className="w-full text-left px-4 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--accent-wash)] hover:text-[var(--text-primary)] transition-colors"
            onClick={() => { setModal({ type: 'rename', path: ctxMenu.path }); setModalInput(ctxMenu.path.split('/').pop()!); setCtxMenu(null) }}>Rename</button>
          {!ctxMenu.isDir && (
            <button className="w-full text-left px-4 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--accent-wash)] hover:text-[var(--text-primary)] transition-colors"
              onClick={() => { downloadFile(ctxMenu.path.split('/').pop()!, fs[ctxMenu.path]); setCtxMenu(null) }}>Download</button>
          )}
          <div className="border-t border-[var(--border-soft)] my-1" />
          <button className="w-full text-left px-4 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)] transition-colors"
            onClick={() => handleDeleteNode(ctxMenu.path, ctxMenu.isDir)}>Delete</button>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-soft)] rounded-2xl p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[13.5px] font-semibold mb-3 text-[var(--text-primary)]">
              {modal.type === 'newFile' ? 'New File' : modal.type === 'newFolder' ? 'New Folder' : 'Rename'}
            </h3>
            <input autoFocus type="text" value={modalInput} onChange={(e) => setModalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleModalConfirm(); if (e.key === 'Escape') setModal(null) }}
              placeholder=""
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-soft)] text-[var(--text-primary)] text-[13px] outline-none focus:border-[var(--accent)] transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace" }} />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 text-[12px] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-secondary)] transition-colors">Cancel</button>
              <button onClick={handleModalConfirm} className="px-4 py-1.5 text-[12px] rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] transition-colors">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
