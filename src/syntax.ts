// File → language detection, used for file icons, tab labels, and picking
// the right CodeMirror language extension in App.tsx. Actual syntax
// highlighting, autocomplete, and indentation are handled by CodeMirror 6
// (see `getEditorExtensions` in App.tsx) — this file used to contain a
// hand-rolled regex-based highlighter, which was retired because regex
// tokenizing can't correctly handle nested/context-sensitive syntax
// (that's what caused the "unclosed tag swallows the rest of the file" bug).

const EXT_MAP: Record<string, string> = {
  py: 'python', pyw: 'python',
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  php: 'php',
  json: 'json',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql',
  rs: 'rust', go: 'go', java: 'java',
  cpp: 'cpp', cc: 'cpp', c: 'cpp', h: 'cpp', hpp: 'cpp',
  md: 'markdown', mdx: 'markdown',
  yml: 'yaml', yaml: 'yaml',
  xml: 'xml', svg: 'xml',
}

const LANG_LABELS: Record<string, string> = {
  python: 'Python', html: 'HTML', css: 'CSS', javascript: 'JavaScript',
  typescript: 'TypeScript', php: 'PHP', json: 'JSON', bash: 'Shell',
  sql: 'SQL', rust: 'Rust', go: 'Go', java: 'Java', cpp: 'C++',
  markdown: 'Markdown', yaml: 'YAML', xml: 'XML',
}

export function getLang(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MAP[ext] ?? null
}

export function getLangLabel(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'c' || ext === 'h') return 'C'
  const lang = getLang(filename)
  return lang ? (LANG_LABELS[lang] ?? lang) : 'Plain Text'
}
