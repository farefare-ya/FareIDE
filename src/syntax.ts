// Self-contained syntax highlighter — no external deps

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

type Rule = { re: RegExp; cls: string }

function applyRules(code: string, rules: Rule[]): string {
  // Build a combined regex with named groups
  const combined = new RegExp(
    rules.map((r, i) => `(?<g${i}>${r.re.source})`).join('|'),
    'gms'
  )
  let out = ''
  let last = 0
  for (const m of code.matchAll(combined)) {
    if (m.index! > last) out += esc(code.slice(last, m.index))
    const ruleIdx = rules.findIndex((_, i) => m.groups![`g${i}`] !== undefined)
    const cls = rules[ruleIdx].cls
    out += cls ? `<span class="hljs-${cls}">${esc(m[0])}</span>` : esc(m[0])
    last = m.index! + m[0].length
  }
  if (last < code.length) out += esc(code.slice(last))
  return out
}

// ── Language rule sets ────────────────────────────────────────────────────────

const PY_KEYWORDS = ['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']
const PY_BUILTINS = ['print', 'len', 'range', 'int', 'str', 'float', 'list', 'dict', 'set', 'tuple', 'bool', 'type', 'isinstance', 'input', 'open', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'sum', 'min', 'max', 'abs', 'round', 'repr', 'super', 'object', 'property', 'staticmethod', 'classmethod']
const PY_KW = new RegExp(`\\b(${PY_KEYWORDS.join('|')})\\b`)
const PY_BUILTIN = new RegExp(`\\b(${PY_BUILTINS.join('|')})\\b`)

const PY_RULES: Rule[] = [
  { re: /"""[\s\S]*?"""|'''[\s\S]*?'''/, cls: 'string' },
  { re: /#[^\n]*/, cls: 'comment' },
  { re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, cls: 'string' },
  { re: /\b\d+(\.\d+)?(e[+-]?\d+)?j?\b/i, cls: 'number' },
  { re: /@[\w.]+/, cls: 'meta' },
  { re: PY_KW, cls: 'keyword' },
  { re: PY_BUILTIN, cls: 'built_in' },
  { re: /\b[A-Z][A-Za-z0-9_]*\b/, cls: 'type' },
  { re: /\b([a-z_]\w*)\s*(?=\()/, cls: 'title' },
]

const JS_KEYWORDS = ['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'static', 'super', 'switch', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'async', 'await', 'from', 'as']
const JS_LITERALS = ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'this', 'self', 'globalThis']
const JS_BUILTINS = ['console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise', 'Error', 'Date', 'RegExp', 'Map', 'Set', 'Symbol', 'Proxy', 'Reflect', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']
const JS_KW = new RegExp(`\\b(${JS_KEYWORDS.join('|')})\\b`)
const JS_LIT = new RegExp(`\\b(${JS_LITERALS.join('|')})\\b`)
const JS_BUILTIN = new RegExp(`\\b(${JS_BUILTINS.join('|')})\\b`)

const JS_RULES: Rule[] = [
  { re: /\/\*[\s\S]*?\*\//, cls: 'comment' },
  { re: /\/\/[^\n]*/, cls: 'comment' },
  { re: /`(?:[^`\\]|\\.)*`/, cls: 'string' },
  { re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, cls: 'string' },
  { re: /\b\d+(\.\d+)?(e[+-]?\d+)?n?\b/i, cls: 'number' },
  { re: /(?<=\s|^)\/(?:[^\\/\n]|\\.)+\/[gimsuy]*(?=\s|;|,|\)|\.|$)/m, cls: 'string' },
  { re: JS_KW, cls: 'keyword' },
  { re: JS_LIT, cls: 'literal' },
  { re: JS_BUILTIN, cls: 'built_in' },
  { re: /\b[A-Z][A-Za-z0-9_]*\b/, cls: 'type' },
  { re: /\b([a-z_$][\w$]*)\s*(?=\()/, cls: 'title' },
]

const TS_EXTRA_KEYWORDS = ['type', 'interface', 'enum', 'declare', 'namespace', 'abstract', 'implements', 'readonly', 'override', 'satisfies', 'infer', 'keyof', 'never', 'unknown', 'any']
const TS_KW = new RegExp(`\\b(${[...JS_KEYWORDS, ...TS_EXTRA_KEYWORDS].join('|')})\\b`)

const TS_RULES: Rule[] = [
  ...JS_RULES.slice(0, 6),
  { re: TS_KW, cls: 'keyword' },
  { re: JS_LIT, cls: 'literal' },
  { re: JS_BUILTIN, cls: 'built_in' },
  { re: /\b[A-Z][A-Za-z0-9_]*\b/, cls: 'type' },
  { re: /\b([a-z_$][\w$]*)\s*(?=\()/, cls: 'title' },
]

const PHP_KEYWORDS = ['abstract', 'and', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone', 'const', 'continue', 'declare', 'default', 'do', 'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach', 'endif', 'endswitch', 'endwhile', 'extends', 'final', 'finally', 'for', 'foreach', 'function', 'global', 'goto', 'if', 'implements', 'include', 'include_once', 'instanceof', 'insteadof', 'interface', 'isset', 'list', 'match', 'namespace', 'new', 'or', 'print', 'private', 'protected', 'public', 'require', 'require_once', 'return', 'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'yield', 'fn', 'enum', 'readonly', 'null', 'true', 'false', 'TRUE', 'FALSE', 'NULL']
const PHP_KW = new RegExp(`\\b(${PHP_KEYWORDS.join('|')})\\b`)
const PHP_RULES: Rule[] = [
  { re: /\/\*[\s\S]*?\*\//, cls: 'comment' },
  { re: /\/\/[^\n]*|#[^\n]*/, cls: 'comment' },
  { re: /<<<['"]?(\w+)['"]?[\s\S]*?\1;/, cls: 'string' },
  { re: /"(?:[^"\\$]|\\.|\$(?!\{|[a-zA-Z_]))*"|'(?:[^'\\]|\\.)*'/, cls: 'string' },
  { re: /\b\d+(\.\d+)?\b/, cls: 'number' },
  { re: /\$[a-zA-Z_]\w*/, cls: 'variable' },
  { re: PHP_KW, cls: 'keyword' },
  { re: /\b[A-Z][A-Za-z0-9_]*\b/, cls: 'type' },
  { re: /\b([a-z_]\w*)\s*(?=\()/, cls: 'title' },
]

// HTML tokenizer (handles embedded CSS & JS)
function highlightHtml(code: string): string {
  const TAG_RE = /(<\/?\s*)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)(\/?>)/gs
  const ATTR_RE = /\b([\w:-]+)\s*(=)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)/g
  const COMMENT_RE = /<!--[\s\S]*?-->/g
  const STYLE_RE = /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi
  const SCRIPT_RE = /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi

  let out = esc(code)

  // Replace comments
  out = out.replace(COMMENT_RE, (m) => `<span class="hljs-comment">${esc(m)}</span>`)

  // Replace <style>…</style> with highlighted CSS inside
  out = out.replace(STYLE_RE, (_, open, body, close) =>
    `<span class="hljs-tag">${esc(open)}</span>${highlightCss(body)}<span class="hljs-tag">${esc(close)}</span>`
  )

  // Replace <script>…</script> with highlighted JS inside
  out = out.replace(SCRIPT_RE, (_, open, body, close) =>
    `<span class="hljs-tag">${esc(open)}</span>${applyRules(body, JS_RULES)}<span class="hljs-tag">${esc(close)}</span>`
  )

  // Tags
  out = out.replace(TAG_RE, (_, ltSlash, tagName, attrs, gt) => {
    const attrStr = attrs.replace(ATTR_RE, (_: string, name: string, eq: string, val: string) =>
      `<span class="hljs-attr">${esc(name)}</span>${esc(eq)}<span class="hljs-string">${esc(val)}</span>`
    )
    return (
      `<span class="hljs-tag">${esc(ltSlash)}<span class="hljs-name">${esc(tagName)}</span>${attrStr}${esc(gt)}</span>`
    )
  })

  return out
}

// Wait — the above approach double-escapes since we're operating on escaped strings.
// Let me do a proper pass on raw code instead.

function highlightHtmlRaw(code: string): string {
  const rules: Rule[] = [
    { re: /<!--[\s\S]*?-->/, cls: 'comment' },
    // style block — highlight CSS inside
    { re: /<style[^>]*>[\s\S]*?<\/style>/i, cls: '' },
    // script block — highlight JS inside
    { re: /<script[^>]*>[\s\S]*?<\/script>/i, cls: '' },
    { re: /<\/?\s*[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^>]*)?\s*\/?>/, cls: '' },
    { re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, cls: 'string' },
    { re: /&[#a-zA-Z]\w*;/, cls: 'symbol' },
  ]

  const combined = new RegExp(
    rules.map((r, i) => `(?<g${i}>${r.re.source})`).join('|'),
    'gms'
  )

  let out = ''
  let last = 0

  for (const m of code.matchAll(combined)) {
    if (m.index! > last) out += esc(code.slice(last, m.index))
    const ruleIdx = rules.findIndex((_, i) => m.groups![`g${i}`] !== undefined)
    const raw = m[0]

    if (ruleIdx === 1) {
      // style block
      const styleMatch = raw.match(/^(<style[^>]*>)([\s\S]*?)(<\/style>)$/i)
      if (styleMatch) {
        out += `<span class="hljs-tag">${esc(styleMatch[1])}</span>${highlightCss(styleMatch[2])}<span class="hljs-tag">${esc(styleMatch[3])}</span>`
      } else out += esc(raw)
    } else if (ruleIdx === 2) {
      // script block
      const scriptMatch = raw.match(/^(<script[^>]*>)([\s\S]*?)(<\/script>)$/i)
      if (scriptMatch) {
        out += `<span class="hljs-tag">${esc(scriptMatch[1])}</span>${applyRules(scriptMatch[2], JS_RULES)}<span class="hljs-tag">${esc(scriptMatch[3])}</span>`
      } else out += esc(raw)
    } else if (ruleIdx === 3) {
      // tag
      out += highlightTag(raw)
    } else if (rules[ruleIdx].cls) {
      out += `<span class="hljs-${rules[ruleIdx].cls}">${esc(raw)}</span>`
    } else {
      out += esc(raw)
    }

    last = m.index! + raw.length
  }
  if (last < code.length) out += esc(code.slice(last))
  return out
}

function highlightTag(raw: string): string {
  // Parse tag tokens: <tagname attr="val" ...>
  const tagRe = /^(<\/?\s*)([a-zA-Z][a-zA-Z0-9:-]*)(.*)(\s*\/?>)$/s
  const m = raw.match(tagRe)
  if (!m) return esc(raw)
  const [, ltSlash, name, attrs, gt] = m
  const attrHighlighted = attrs.replace(
    /\b([\w:-]+)(\s*=\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    (_, n, eq, v) => `<span class="hljs-attr">${esc(n)}</span>${esc(eq)}<span class="hljs-string">${esc(v)}</span>`
  ).replace(
    /\b([\w:-]+)(?!=)/g,
    (_, n) => `<span class="hljs-attr">${esc(n)}</span>`
  )
  return `<span class="hljs-tag">${esc(ltSlash)}<span class="hljs-name">${esc(name)}</span>${attrHighlighted}${esc(gt)}</span>`
}

function highlightCss(code: string): string {
  const rules: Rule[] = [
    { re: /\/\*[\s\S]*?\*\//, cls: 'comment' },
    { re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, cls: 'string' },
    { re: /\b\d+(\.\d+)?(px|em|rem|vh|vw|%|s|ms|deg|fr|ch|ex|vmin|vmax|pt|pc|cm|mm|in)?\b/, cls: 'number' },
    { re: /#[0-9a-fA-F]{3,8}\b/, cls: 'number' },
    { re: /\b(important|inherit|initial|unset|revert|auto|none|normal|bold|italic|underline|solid|dashed|dotted|hidden|visible|absolute|relative|fixed|sticky|flex|grid|block|inline|inline-block|inline-flex|inline-grid|center|left|right|top|bottom|space-between|space-around|space-evenly|stretch|nowrap|wrap|column|row|transparent|currentColor)\b/, cls: 'literal' },
    { re: /@[\w-]+/, cls: 'keyword' },
    { re: /:([\w-]+)/, cls: 'selector-pseudo' },
    { re: /\.([\w-]+)/, cls: 'selector-class' },
    { re: /#([\w-]+)(?!\s*\{)/, cls: 'selector-id' },
    { re: /\b([a-z-]+)\s*(?=:)/, cls: 'attribute' },
    { re: /[{}:;,]/, cls: 'punctuation' },
  ]
  return applyRules(code, rules)
}

// ── Public API ────────────────────────────────────────────────────────────────

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
  const lang = getLang(filename)
  return lang ? (LANG_LABELS[lang] ?? lang) : 'Plain Text'
}

const JSON_RULES: Rule[] = [
  { re: /"(?:[^"\\]|\\.)*"\s*(?=:)/, cls: 'attr' },
  { re: /"(?:[^"\\]|\\.)*"/, cls: 'string' },
  { re: /\b\d+(\.\d+)?(e[+-]?\d+)?\b/i, cls: 'number' },
  { re: /\b(true|false|null)\b/, cls: 'literal' },
]

const GENERIC_RULES: Rule[] = [
  { re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, cls: 'string' },
  { re: /\b\d+(\.\d+)?\b/, cls: 'number' },
  { re: /#[^\n]*|\/\/[^\n]*/, cls: 'comment' },
]

const CSS_PROPERTIES = ['align-items', 'background', 'background-color', 'border', 'border-radius', 'bottom', 'box-shadow', 'color', 'display', 'flex', 'flex-direction', 'font-family', 'font-size', 'font-weight', 'gap', 'grid-template-columns', 'height', 'justify-content', 'left', 'line-height', 'margin', 'opacity', 'overflow', 'padding', 'position', 'right', 'text-align', 'top', 'transform', 'transition', 'width', 'z-index']
const CSS_VALUES = ['flex', 'grid', 'block', 'inline-block', 'absolute', 'relative', 'fixed', 'sticky', 'center', 'space-between', 'none', 'auto', 'solid', 'bold', 'italic', 'underline', 'hidden', 'visible']

// All known HTML tag names (used for the identifier-style dropdown, e.g. typing "head" before deciding on '>')
const HTML_TAGS = [
  'html', 'head', 'body', 'title', 'meta', 'link', 'style', 'script', 'noscript', 'base',
  'div', 'span', 'a', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'button', 'input', 'form', 'label', 'select', 'option', 'optgroup', 'textarea', 'fieldset', 'legend',
  'img', 'picture', 'source', 'video', 'audio', 'canvas', 'svg', 'iframe',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'figure', 'figcaption',
  'strong', 'em', 'b', 'i', 'u', 's', 'small', 'code', 'pre', 'blockquote', 'q', 'mark', 'sub', 'sup', 'abbr', 'time',
]

// Void elements never get an auto-inserted closing tag
const HTML_VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

const HTML5_BOILERPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
</head>
<body>
  |
</body>
</html>
`

// ── Autocomplete word lists ──────────────────────────────────────────────────

export function getCompletionWords(lang: string | null): string[] {
  switch (lang) {
    case 'python': return [...PY_KEYWORDS, ...PY_BUILTINS]
    case 'javascript': return [...JS_KEYWORDS, ...JS_LITERALS, ...JS_BUILTINS]
    case 'typescript': return [...JS_KEYWORDS, ...TS_EXTRA_KEYWORDS, ...JS_LITERALS, ...JS_BUILTINS]
    case 'php': return PHP_KEYWORDS
    case 'css': return [...CSS_PROPERTIES, ...CSS_VALUES]
    case 'html': return HTML_TAGS
    case 'json': return ['true', 'false', 'null']
    default: return []
  }
}

export function isVoidHtmlTag(tag: string): boolean {
  return HTML_VOID_TAGS.has(tag.toLowerCase())
}

export function getHtml5Boilerplate(): string {
  return HTML5_BOILERPLATE
}

// Snippet body uses '|' to mark where the cursor should land after insertion.
export interface Snippet { trigger: string; label: string; body: string }

export function getSnippets(lang: string | null): Snippet[] {
  switch (lang) {
    case 'html':
      return [
        { trigger: 'doctype', label: '<!DOCTYPE html> → full HTML5 skeleton', body: HTML5_BOILERPLATE },
      ]
    case 'python':
      return [
        { trigger: 'def', label: 'def name(): ...', body: 'def |():\n    pass' },
        { trigger: 'class', label: 'class Name: ...', body: 'class |:\n    def __init__(self):\n        pass' },
        { trigger: 'for', label: 'for i in range(): ...', body: 'for i in range(|):\n    pass' },
        { trigger: 'if', label: 'if ...: ...', body: 'if |:\n    pass' },
        { trigger: 'try', label: 'try/except', body: 'try:\n    |\nexcept Exception as e:\n    pass' },
      ]
    case 'javascript':
    case 'typescript':
      return [
        { trigger: 'function', label: 'function name() {}', body: 'function |() {\n  \n}' },
        { trigger: 'class', label: 'class Name {}', body: 'class | {\n  constructor() {\n    \n  }\n}' },
        { trigger: 'for', label: 'for (...) {}', body: 'for (let i = 0; i < |; i++) {\n  \n}' },
        { trigger: 'if', label: 'if (...) {}', body: 'if (|) {\n  \n}' },
      ]
    case 'php':
      return [
        { trigger: 'function', label: 'function name() {}', body: 'function |() {\n    \n}' },
        { trigger: 'if', label: 'if (...) {}', body: 'if (|) {\n    \n}' },
        { trigger: 'foreach', label: 'foreach ($arr as $value) {}', body: 'foreach ($| as $value) {\n    \n}' },
      ]
    default:
      return []
  }
}

export function highlightCode(code: string, filename: string): string {
  const lang = getLang(filename)
  try {
    switch (lang) {
      case 'python': return applyRules(code, PY_RULES)
      case 'javascript': return applyRules(code, JS_RULES)
      case 'typescript': return applyRules(code, TS_RULES)
      case 'php': return applyRules(code, PHP_RULES)
      case 'html': return highlightHtmlRaw(code)
      case 'css': return highlightCss(code)
      case 'xml': return highlightHtmlRaw(code)
      case 'json': return applyRules(code, JSON_RULES)
      default: return applyRules(code, GENERIC_RULES)
    }
  } catch {
    return esc(code)
  }
}
