// File → runnable-language mapping. This is deliberately separate from
// syntax.ts's getLang(): syntax.ts groups .c/.h/.cpp together as one
// CodeMirror "cpp" mode, but running a .c file needs `gcc` while a .cpp
// file needs `g++`, so execution needs a finer-grained id. The id
// returned here is sent straight to the Rust `run_code` command, which
// matches on it to build the right shell command (see src-tauri/src/main.rs
// build_script()) — the two lists must stay in sync.

const RUN_EXT_MAP: Record<string, string> = {
  py: 'python', pyw: 'python',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  java: 'java',
  rs: 'rust',
  go: 'go',
  php: 'php',
  rb: 'ruby',
  sh: 'bash', bash: 'bash',
  sql: 'sql',
  pl: 'perl', pm: 'perl',
  lua: 'lua',
  r: 'r',
}

// Shown in the Run button tooltip and the terminal's "$ ..." echo line.
const RUN_LABELS: Record<string, string> = {
  python: 'python3', javascript: 'node', typescript: 'tsx',
  c: 'gcc', cpp: 'g++', java: 'java', rust: 'rustc', go: 'go run',
  php: 'php', ruby: 'ruby', bash: 'bash', sql: 'sqlite3',
  perl: 'perl', lua: 'lua', r: 'Rscript',
}

export function getRunLanguage(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return RUN_EXT_MAP[ext] ?? null
}

export function isRunnable(filename: string): boolean {
  return getRunLanguage(filename) !== null
}

export function getRunnerLabel(filename: string): string {
  const lang = getRunLanguage(filename)
  return lang ? (RUN_LABELS[lang] ?? lang) : ''
}
