import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import JSZip from 'jszip'
import { getLang, getLangLabel } from './syntax'

import CodeMirror from '@uiw/react-codemirror'
import { EditorView, keymap } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting, StreamLanguage } from '@codemirror/language'
import { snippetCompletion, completeFromList } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'

import { html, htmlLanguage } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
import { python, pythonLanguage } from '@codemirror/lang-python'
import { php, phpLanguage } from '@codemirror/lang-php'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { go as goMode } from '@codemirror/legacy-modes/mode/go'

// ── CodeMirror theme — matches FareIDE's dark purple aesthetic ────────────────

const fareideEditorTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: '#dde1ee', height: '100%', fontSize: '13.5px' },
  '.cm-content': { fontFamily: "'JetBrains Mono', monospace", caretColor: '#c4b9ff', padding: '16px 0' },
  '.cm-line': { padding: '0 16px' },
  '.cm-scroller': { fontFamily: "'JetBrains Mono', monospace", lineHeight: '22px' },
  '.cm-gutters': { backgroundColor: '#09090d', color: '#3e4256', border: 'none', borderRight: '1px solid #1e1e28' },
  '.cm-gutterElement': { padding: '0 12px 0 16px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#9ca0b0' },
  '.cm-activeLine': { backgroundColor: '#ffffff05' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#7c6af740 !important' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#c4b9ff' },
  '.cm-matchingBracket, .cm-nonmatchingBracket': { backgroundColor: '#7c6af730', outline: '1px solid #7c6af760' },
  '.cm-tooltip': { backgroundColor: '#14141c', border: '1px solid #2a2a38', borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#7c6af730', color: '#c4b9ff' },
  '.cm-tooltip-autocomplete ul li': { padding: '3px 10px' },
  '.cm-foldPlaceholder': { backgroundColor: '#1e1e28', border: 'none', color: '#9ca0b0' },
}, { dark: true })

const fareideHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: '#4a5068', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: '#c792ea' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#c3e88d' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#f78c6c' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#82aaff' },
  { tag: [t.className, t.typeName], color: '#ffcb6b' },
  { tag: [t.operator, t.punctuation, t.angleBracket], color: '#89ddff' },
  { tag: t.propertyName, color: '#82aaff' },
  { tag: t.attributeName, color: '#ffcb6b' },
  { tag: t.attributeValue, color: '#c3e88d' },
  { tag: t.tagName, color: '#f07178' },
  { tag: t.variableName, color: '#dde1ee' },
  { tag: t.meta, color: '#f07178' },
  { tag: t.invalid, color: '#ff5f57' },
])

const fareideTheme: Extension[] = [fareideEditorTheme, syntaxHighlighting(fareideHighlightStyle)]

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
      return [...base, python(), pythonLanguage.data.of({ autocomplete: completeFromList(pySnippets) })]
    case 'php':
      return [...base, php(), phpLanguage.data.of({ autocomplete: completeFromList(phpSnippets) })]
    case 'json':
      return [...base, json()]
    case 'markdown':
      return [...base, markdown()]
    case 'xml':
      return [...base, xml()]
    case 'cpp':
      return [...base, cpp()]
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
  const allFiles = Object.keys(fs).sort().map((p) => ({ path: p, isDir: false, name: p.split('/').pop()! }))

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
        <path d="M1 3.5C1 2.67 1.67 2 2.5 2H6l1.5 2H14c.55 0 1 .45 1 1v7c0 .55-.45 1-1 1H2.5C1.67 13 1 12.33 1 11.5V3.5Z" fill="#7c6af7" opacity=".7"/>
      ) : (
        <path d="M1 3.5C1 2.67 1.67 2 2.5 2H6l1.5 2H13.5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-11C1.67 13 1 12.33 1 11.5V3.5Z" fill="#5c6070" opacity=".8"/>
      )}
    </svg>
  )
}

function IconFile({ lang }: { lang: string | null }) {
  const colors: Record<string, string> = {
    python: '#3b82f6', html: '#f97316', css: '#a855f7',
    javascript: '#eab308', typescript: '#3b82f6', php: '#8b5cf6',
    json: '#6b7280', bash: '#10b981', sql: '#06b6d4',
    rust: '#f97316', go: '#06b6d4', java: '#ef4444',
    cpp: '#3b82f6', markdown: '#9ca3af', yaml: '#f59e0b', xml: '#f97316',
  }
  const color = lang ? (colors[lang] ?? '#6b7280') : '#6b7280'
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
      <path d="M3 2l4 3-4 3" stroke="#4a4e5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
          isSelected ? 'bg-[#7c6af720] text-[#c4b9ff]' : 'text-[#9ca0b0] hover:text-[#e2e4ea] hover:bg-[#ffffff07]'
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

function CodeEditor({ content, onChange, path }: {
  content: string; onChange: (v: string) => void; path: string
}) {
  const extensions = useMemo(() => getEditorExtensions(path), [path])

  return (
    <CodeMirror
      value={content}
      onChange={onChange}
      theme={fareideTheme}
      extensions={extensions}
      height="100%"
      basicSetup={{ tabSize: 2, highlightActiveLine: true, foldGutter: true }}
      style={{ height: '100%' }}
      className="h-full"
    />
  )
}


// ── Context menu ───────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; path: string; isDir: boolean }

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [fs, setFs] = useState<FileSystem>({ 'main.py': '# Welcome to FareIDE\nprint("Hello, world!")\n' })
  const [tabs, setTabs] = useState<Tab[]>([{ path: 'main.py', dirty: false }])
  const [activeTab, setActiveTab] = useState<string>('main.py')
  const [selectedNode, setSelectedNode] = useState<string | null>('main.py')
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
    <div className="flex flex-col h-screen bg-[#0a0a0e] text-[#e2e4ea] overflow-hidden select-none" onClick={() => setCtxMenu(null)}>

      {/* Title bar */}
      <div className="flex items-center justify-between h-10 px-4 bg-[#0e0e13] border-b border-[#1c1c28] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight">
            <span className="text-[#7c6af7]">Fare</span>
            <span className="text-[#e2e4ea]">IDE</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { if (activeTab && activeTab in fs) { downloadFile(activeTab.split('/').pop()!, fs[activeTab]); flash('Downloaded') } }}
            disabled={!activeTab}
            className="flex items-center gap-1.5 px-3 py-1 text-[12px] rounded bg-[#1a1a24] hover:bg-[#7c6af720] hover:text-[#c4b9ff] border border-[#2a2a38] transition-colors disabled:opacity-30 text-[#7c8090]">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5.5l3 3 3-3M1 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Download
          </button>
          <button onClick={() => downloadZip(fs)}
            className="flex items-center gap-1.5 px-3 py-1 text-[12px] rounded bg-[#1a1a24] hover:bg-[#7c6af720] hover:text-[#c4b9ff] border border-[#2a2a38] transition-colors text-[#7c8090]">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4 4h4M4 6.5h4M4 9h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
            Export ZIP
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-56 bg-[#0c0c11] border-r border-[#1c1c28] flex flex-col shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1c1c28]">
            <span className="text-[10.5px] font-semibold uppercase tracking-widest text-[#3e4256]">Explorer</span>
            <div className="flex gap-0.5">
              <button title="New File" onClick={() => { setModal({ type: 'newFile' }); setModalInput('') }}
                className="w-6 h-6 flex items-center justify-center rounded text-[#4a4e5e] hover:text-[#c4b9ff] hover:bg-[#7c6af720] transition-colors">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 2h6l3 3v7H2V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 2v3h3M5 7h4M5 9.5h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><path d="M10.5 9v4M8.5 11h4" stroke="#7c6af7" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
              <button title="New Folder" onClick={() => { setModal({ type: 'newFolder' }); setModalInput('') }}
                className="w-6 h-6 flex items-center justify-center rounded text-[#4a4e5e] hover:text-[#c4b9ff] hover:bg-[#7c6af720] transition-colors">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 3.5C1 2.67 1.67 2 2.5 2H5.5l1.5 2H11.5C12.33 4 13 4.67 13 5.5v5c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5V3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M7 6.5v3M5.5 8h3" stroke="#7c6af7" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 p-2 border-b border-[#1c1c28]">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUploadFiles} />
            <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={handleUploadZip} />
            <button onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded bg-[#1a1a24] hover:bg-[#7c6af720] text-[#7c8090] hover:text-[#c4b9ff] border border-[#2a2a38] transition-colors">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 9V2M3 4.5L6 2l3 2.5M1 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Upload
            </button>
            <button onClick={() => zipInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded bg-[#1a1a24] hover:bg-[#7c6af720] text-[#7c8090] hover:text-[#c4b9ff] border border-[#2a2a38] transition-colors">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4 1v4M8 1v4M4 5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
              ZIP
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
            {tree.length === 0 && (
              <div className="px-4 py-8 text-center text-[11px] text-[#3e4256]">No files yet.<br />Upload or create one.</div>
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
          <div className="flex items-end h-9 bg-[#0c0c11] border-b border-[#1c1c28] overflow-x-auto shrink-0 scrollbar-none">
            {tabs.map((tab) => {
              const isActive = tab.path === activeTab
              const name = tab.path.split('/').pop()!
              const lang = getLang(name)
              return (
                <button key={tab.path} onClick={() => setActiveTab(tab.path)}
                  className={`group flex items-center gap-2 px-3 h-full text-[12.5px] border-r border-[#1c1c28] transition-colors shrink-0 max-w-[200px] ${
                    isActive ? 'bg-[#0a0a0e] text-[#e2e4ea] border-t border-t-[#7c6af7]' : 'text-[#6b6f7e] hover:text-[#9ca0b0] hover:bg-[#ffffff05]'
                  }`}>
                  <IconFile lang={lang} />
                  <span className="truncate">{name}</span>
                  {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-[#7c6af7] shrink-0" />}
                  <span onClick={(e) => closeTab(tab.path, e)}
                    className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-[#ff5f57] transition-opacity text-[11px]">
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Editor */}
          {activeTab && activeTab in fs ? (
            <div className="flex-1 min-h-0 overflow-hidden select-text">
              <CodeEditor key={activeTab} path={activeTab} content={activeContent} onChange={(v) => updateContent(activeTab, v)} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity={0.08}><rect x="4" y="4" width="40" height="40" rx="6" stroke="#e2e4ea" strokeWidth="2"/><path d="M16 18l-6 6 6 6M32 18l6 6-6 6M28 14l-8 20" stroke="#e2e4ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <div className="text-center">
                <p className="text-[18px] font-semibold text-[#2a2a38]">FareIDE</p>
                <p className="text-[12px] text-[#3e4256] mt-1">Open a file from the explorer or create a new one</p>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setModal({ type: 'newFile' }); setModalInput('') }}
                  className="px-4 py-2 text-[12px] rounded-lg bg-[#7c6af720] text-[#c4b9ff] border border-[#7c6af740] hover:bg-[#7c6af730] transition-colors">
                  New File
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-[12px] rounded-lg bg-[#1a1a24] text-[#7c8090] border border-[#2a2a38] hover:text-[#c4b9ff] hover:bg-[#7c6af720] transition-colors">
                  Upload File
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between h-6 px-4 bg-[#7c6af7] shrink-0">
        <div className="flex items-center gap-2 text-[11px] text-[#c4b9ff]">
          <span className="font-semibold text-white">FareIDE</span>
          {activeTab && <><span className="opacity-40">›</span><span className="opacity-70 truncate max-w-[300px]">{activeTab}</span></>}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[#c4b9ff]">
          {statusMsg
            ? <span className="text-white font-medium">{statusMsg}</span>
            : activeTab && <span className="opacity-60">{getLangLabel(activeTab)}</span>}
          <span className="opacity-50">{Object.keys(fs).length} files</span>
          <span className="opacity-50">Ctrl+S save</span>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="fixed z-50 bg-[#14141c] border border-[#2a2a38] rounded-xl shadow-2xl py-1.5 min-w-[156px] text-[12.5px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}>
          {!ctxMenu.isDir && (
            <button className="w-full text-left px-4 py-1.5 text-[#9ca0b0] hover:bg-[#7c6af720] hover:text-[#e2e4ea] transition-colors"
              onClick={() => { openFile(ctxMenu.path); setCtxMenu(null) }}>Open</button>
          )}
          <button className="w-full text-left px-4 py-1.5 text-[#9ca0b0] hover:bg-[#7c6af720] hover:text-[#e2e4ea] transition-colors"
            onClick={() => { setModal({ type: 'rename', path: ctxMenu.path }); setModalInput(ctxMenu.path.split('/').pop()!); setCtxMenu(null) }}>Rename</button>
          {!ctxMenu.isDir && (
            <button className="w-full text-left px-4 py-1.5 text-[#9ca0b0] hover:bg-[#7c6af720] hover:text-[#e2e4ea] transition-colors"
              onClick={() => { downloadFile(ctxMenu.path.split('/').pop()!, fs[ctxMenu.path]); setCtxMenu(null) }}>Download</button>
          )}
          <div className="border-t border-[#2a2a38] my-1" />
          <button className="w-full text-left px-4 py-1.5 text-[#9ca0b0] hover:bg-[#ff5f5720] hover:text-[#ff5f57] transition-colors"
            onClick={() => handleDeleteNode(ctxMenu.path, ctxMenu.isDir)}>Delete</button>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-[#14141c] border border-[#2a2a38] rounded-2xl p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[13.5px] font-semibold mb-3 text-[#e2e4ea]">
              {modal.type === 'newFile' ? 'New File' : modal.type === 'newFolder' ? 'New Folder' : 'Rename'}
            </h3>
            <input autoFocus type="text" value={modalInput} onChange={(e) => setModalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleModalConfirm(); if (e.key === 'Escape') setModal(null) }}
              placeholder={modal.type === 'newFile' ? 'filename.py' : modal.type === 'newFolder' ? 'folder-name' : 'new-name'}
              className="w-full px-3 py-2 rounded-lg bg-[#0a0a0e] border border-[#2a2a38] text-[#e2e4ea] text-[13px] outline-none focus:border-[#7c6af7] transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace" }} />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 text-[12px] rounded-lg text-[#6b6f7e] hover:text-[#9ca0b0] transition-colors">Cancel</button>
              <button onClick={handleModalConfirm} className="px-4 py-1.5 text-[12px] rounded-lg bg-[#7c6af7] text-white hover:bg-[#6a59e0] transition-colors">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
