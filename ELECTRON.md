# Running FareIDE as a desktop app

FareIDE can now run as a real native window (Electron) instead of just in a
browser tab. This unlocks one thing a browser fundamentally can't do: a
**real system terminal** — an actual shell (`zsh` on macOS, `bash` on Linux),
not the Python-only Pyodide console.

## Why this needs a real `npm install` on your machine

The real terminal is powered by `node-pty`, a **native** module — it's not
JavaScript, it's compiled C++ that talks to the OS's actual pseudo-terminal
API. That means:

- It **must be compiled on the same OS you're shipping for** (a macOS binary
  can only be built on macOS; a Linux binary only on Linux). There's no way
  around this — it's not something I can pre-build once and hand you.
- `npm install` (or `pnpm install`) handles this automatically via
  `node-gyp`, as long as your machine can reach the internet normally. My own
  sandbox environment has a locked-down network allowlist that blocks the
  header downloads node-gyp needs — that's specific to my setup, not
  something you'll hit.

So: everything below just needs a normal `npm install` on your own Mac or
Linux machine.

## Running it in development

```bash
npm install
npm run electron:dev
```

This starts the Vite dev server and opens an Electron window pointed at it,
with DevTools open. Editing `src/` hot-reloads like normal; editing
`electron/main.cjs` or `electron/preload.cjs` needs a restart of this command.

## Building an installable app

```bash
# On macOS:
npm run electron:build:mac

# On Linux:
npm run electron:build:linux
```

Output lands in `release/`. macOS gets a `.dmg` and a `.zip`; Linux gets an
`.AppImage` and a `.deb`. **Build each on its own OS** — same native-module
reason as above; there's no cross-compiling this from one to the other.

The mac build is unsigned (no Apple Developer certificate configured), so
macOS Gatekeeper will flag it on first launch — right-click → Open bypasses
that for a local build. Proper code-signing/notarization is a separate step
if you ever want to distribute this beyond your own machine.

## What's actually different from the browser version

| | Browser (`npm run dev`) | Desktop app (`npm run electron:dev`) |
|---|---|---|
| Python (Pyodide) console | ✅ | ✅ |
| Real system terminal (`zsh`/`bash`) | ❌ (Terminal tab explains why) | ✅ |
| Window chrome | Browser tab | Real native window |

Everything else — the editor, file tree, themes, all of it — is identical
code either way. The Electron shell just wraps the same app and adds the one
capability a browser can never have: actual OS process access.
