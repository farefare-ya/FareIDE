# FareIDE

FareIDE is a desktop code editor built with Tauri, React, and CodeMirror.
Unlike most online IDEs that simulate a programming language inside the
browser, FareIDE runs code directly using the compilers and interpreters
already installed on your machine, the same way a terminal or a regular code
editor would.

## Preview

![FareIDE Preview](src/review.jpg)

## Features

- Code editor with syntax highlighting for many programming languages
- Real code execution (not a browser simulation) via system compilers and interpreters
- Real-time terminal output with interactive stdin support
- Multi-file project support (local imports, headers, separate classes, etc.)
- Open in Browser button for previewing HTML files
- Runs as a native desktop app (Windows, macOS, Linux)

## Supported Languages for Execution

| Language | Required Toolchain |
|---|---|
| Python | python3 |
| JavaScript | node |
| TypeScript | node (via npx tsx) |
| C | gcc |
| C++ | g++ |
| Java | JDK (javac, java) |
| Rust | rustc |
| Go | go |
| PHP | php |
| Ruby | ruby |
| Bash | bash |
| SQL | sqlite3 |
| Perl | perl |
| Lua | lua |
| R | Rscript |

FareIDE does not bundle any compilers inside the app itself. Install only the
toolchains for the languages you want to run; if one isn't installed, the
terminal shows a clear error message instead of hanging silently.

## Prerequisites

To build and run this project from source:

| Tool | Version | Check with |
|---|---|---|
| Node.js | 18 or newer | `node --version` |
| Rust | 1.77.2 or newer, via [rustup.rs](https://rustup.rs) | `rustc --version` |
| Tauri CLI | installed automatically via npm install | `npx tauri --version` |

Additional platform-specific system dependencies (required by Tauri to build):

- Linux: `webkit2gtk-4.1`, `libgtk-3-dev`, `librsvg2-dev`,
  `libayatana-appindicator3-dev`, `build-essential`. Full list in the
  [Tauri Prerequisites guide](https://v2.tauri.app/start/prerequisites/#linux).
- macOS: Xcode Command Line Tools (`xcode-select --install`).
- Windows: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  and WebView2 (usually preinstalled on Windows 10/11).

## Installation

```bash
git clone https://github.com/farefare-ya/FareIDE.git
cd FareIDE
npm install
```

## Running in Development Mode

```bash
npm run tauri:dev
```

The first compile takes a few minutes since Cargo downloads and compiles all
of Tauri's dependencies. After that, hot reload is fast as usual.

## Building an Installer

```bash
npm run tauri:build
```

Build output lands in `src-tauri/target/release/bundle/`:

- Linux: `.deb`, `.AppImage`, `.rpm`
- macOS: `.dmg`, `.app`
- Windows: `.msi`, `.exe` (NSIS)

Builds are platform-specific; you need to build on each target OS to produce
an installer for that OS.

## Project Structure

```
src/
  App.tsx        Main component: file explorer, tabs, editor, terminal panel
  syntax.ts      File extension to CodeMirror language mapping
  languages.ts   File extension to runnable language mapping
  runner.ts      Frontend bridge to the Tauri backend (invoke/listen)
src-tauri/
  src/lib.rs     Backend: writes the workspace to a temp dir, builds and
                 runs the right shell command per language, streams output
  tauri.conf.json Window, bundle, and dev server configuration
```

## How Code Execution Works

1. When Run is pressed, the entire workspace (not just the active file) is
   written to a temporary folder on disk, so multi-file projects stay intact.
2. The Rust backend builds the shell command for the language, for example
   `gcc main.c -o main.out && ./main.out`, and runs it.
3. Stdout and stderr are streamed to the terminal panel in real time.
4. Text typed into the terminal's input box is sent directly to the running
   process's stdin, supporting `input()`, `Scanner`, `scanf`, and similar.
5. The Stop button terminates the whole process tree, not just the wrapping
   shell process.
6. Only one program can run at a time.

## Limitations

- Java files with a `package` declaration are not supported yet; the class
  name must match the filename, per standard Java rules.
- The first TypeScript run is slightly slower since `npx tsx` needs to
  download the tsx package; it's cached and faster afterward.
- No support yet for projects with their own dependency manager
  (`node_modules`, Maven/Gradle, multi-crate Cargo workspaces, etc.).
  FareIDE is best suited for single-file or few-file scripts and exercises.
