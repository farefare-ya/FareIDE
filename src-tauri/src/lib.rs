// FareIDE's execution backend.
//
// The whole point of moving to a desktop app: instead of simulating one
// language inside a browser sandbox (Pyodide), every "Run" now writes the
// workspace to a temp folder and shells out to whatever's actually
// installed — python3, node, gcc, javac, rustc, go, php, ruby... exactly
// like a terminal or an editor like VS Code would. See `build_script()`
// below for the full language → command table (must stay in sync with
// `src/languages.ts` on the frontend, which decides whether Run is enabled
// for a given file and which language id to send here).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader as TokioBufReader};
use tokio::process::{ChildStdin, Command as TokioCommand};
use tokio::sync::Mutex as TokioMutex;

// ── Wire types (must match src/runner.ts) ───────────────────────────────

#[derive(Debug, Deserialize)]
struct FileEntry {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct RunRequest {
    language: String,
    entry: String,
    files: Vec<FileEntry>,
}

#[derive(Debug, Deserialize)]
struct PreviewRequest {
    entry: String,
    files: Vec<FileEntry>,
}

#[derive(Debug, Serialize, Clone)]
struct OutputPayload {
    stream: &'static str,
    data: String,
}

#[derive(Debug, Serialize, Clone)]
struct ExitPayload {
    code: Option<i32>,
}

// ── Shared state for the single in-flight run ───────────────────────────
// FareIDE only ever runs one program at a time (mirrors the frontend's
// `running` flag / disabled Run button), so a single slot is enough.

pub struct RunState {
    stdin: Arc<TokioMutex<Option<ChildStdin>>>,
    pid: Arc<TokioMutex<Option<u32>>>,
}

impl Default for RunState {
    fn default() -> Self {
        Self {
            stdin: Arc::new(TokioMutex::new(None)),
            pid: Arc::new(TokioMutex::new(None)),
        }
    }
}

// ── Path safety ──────────────────────────────────────────────────────────

/// Rejects absolute paths and `..` components so a stray/odd filename from
/// the in-browser virtual filesystem can never write outside the sandboxed
/// temp run directory.
fn sanitize_rel_path(p: &str) -> Option<PathBuf> {
    let path = Path::new(p);
    if path.is_absolute() {
        return None;
    }
    for comp in path.components() {
        match comp {
            std::path::Component::ParentDir | std::path::Component::Prefix(_) => return None,
            _ => {}
        }
    }
    Some(path.to_path_buf())
}

fn new_run_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{nanos}", std::process::id())
}

/// Writes every workspace file into a fresh temp directory, preserving
/// relative folder structure (so multi-file projects — local imports,
/// headers, sibling classes — work, not just the single active file).
fn materialize_workspace(prefix: &str, files: &[FileEntry]) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join(format!("{prefix}-{}", new_run_id()));
    std::fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create a temp folder to run in: {e}"))?;
    for f in files {
        let Some(rel) = sanitize_rel_path(&f.path) else { continue };
        let full = dir.join(&rel);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Couldn't write {}: {e}", f.path))?;
        }
        std::fs::write(&full, &f.content).map_err(|e| format!("Couldn't write {}: {e}", f.path))?;
    }
    Ok(dir)
}

// ── Shell command construction ──────────────────────────────────────────

fn shell_quote(s: &str) -> String {
    // POSIX single-quote escaping: close the quote, insert an escaped
    // literal quote, reopen — the standard way to safely embed any string
    // (including ones with spaces or quotes) in a `sh -c` argument.
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn win_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

fn quote(s: &str) -> String {
    if cfg!(windows) { win_quote(s) } else { shell_quote(s) }
}

fn python_bin() -> &'static str {
    if cfg!(windows) { "python" } else { "python3" }
}

/// Builds the shell script text that compiles (if needed) and runs `entry`
/// inside `dir`, for the given logical `language` id. Paths are absolute,
/// so the resulting script works regardless of the process's cwd.
///
/// NOTE for Java: this assumes the file has no `package` declaration (the
/// class name must match the filename either way, which we rely on). A
/// package-scoped file will fail to run — acceptable for the single-file
/// / flat-project scripts this IDE is built around.
fn build_script(language: &str, entry_rel: &Path, dir: &Path) -> Result<String, String> {
    let entry_abs = dir.join(entry_rel);
    let stem = entry_abs
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("program")
        .to_string();
    let entry_q = quote(&entry_abs.to_string_lossy());
    let out_ext = if cfg!(windows) { "exe" } else { "out" };
    let out_abs = dir.join(format!("{stem}.{out_ext}"));
    let out_q = quote(&out_abs.to_string_lossy());
    let dir_q = quote(&dir.to_string_lossy());

    let script = match language {
        "python" => format!("{} {}", python_bin(), entry_q),
        "javascript" => format!("node {}", entry_q),
        // tsx isn't always globally installed; `npx --yes` fetches it into a
        // cache on first use and is instant on every run after that.
        "typescript" => format!("npx --yes tsx {}", entry_q),
        "c" => format!("gcc {} -o {} && {}", entry_q, out_q, out_q),
        "cpp" => format!("g++ -std=c++17 {} -o {} && {}", entry_q, out_q, out_q),
        "java" => format!("javac {} && java -cp {} {}", entry_q, dir_q, stem),
        "rust" => format!("rustc {} -o {} && {}", entry_q, out_q, out_q),
        "go" => format!("go run {}", entry_q),
        "php" => format!("php {}", entry_q),
        "ruby" => format!("ruby {}", entry_q),
        "bash" => format!("bash {}", entry_q),
        "sql" => format!("sqlite3 :memory: < {}", entry_q),
        "perl" => format!("perl {}", entry_q),
        "lua" => format!("lua {}", entry_q),
        "r" => format!("Rscript {}", entry_q),
        other => return Err(format!("No runner configured for \"{other}\" yet.")),
    };
    Ok(script)
}

// ── Process termination ─────────────────────────────────────────────────
// `sh -c "compile && run"` spawns a shell that itself spawns the real
// program, so killing just the shell's PID can leave the real process
// running. On Unix we put the shell in its own process group at spawn
// time (see run_code) and kill the whole group; on Windows, `taskkill
// /T` walks and kills the whole process tree for us.

fn kill_tree(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x0800_0000)
            .status();
    }
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// ── Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn run_code(app: AppHandle, state: tauri::State<'_, RunState>, req: RunRequest) -> Result<(), String> {
    {
        let pid_guard = state.pid.lock().await;
        if pid_guard.is_some() {
            return Err("A program is already running — stop it first.".into());
        }
    }

    let entry_rel = sanitize_rel_path(&req.entry).ok_or_else(|| "Invalid entry file path.".to_string())?;
    let dir = materialize_workspace("fareide-run", &req.files)?;
    let script = build_script(&req.language, &entry_rel, &dir)?;

    let (shell_bin, shell_flag) = if cfg!(windows) { ("cmd", "/C") } else { ("sh", "-c") };
    let mut cmd = TokioCommand::new(shell_bin);
    cmd.arg(shell_flag)
        .arg(&script)
        .current_dir(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(unix)]
    {
        cmd.process_group(0); // new process group, pgid == this process's pid
    }
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no flashing console
    }

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Couldn't start the {} toolchain: {e}. Make sure it's installed and on your PATH.",
            req.language
        )
    })?;

    let pid = child.id().ok_or_else(|| "Process exited immediately.".to_string())?;
    let stdin = child.stdin.take();
    let stdout = child.stdout.take().ok_or_else(|| "Missing stdout pipe.".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Missing stderr pipe.".to_string())?;

    *state.stdin.lock().await = stdin;
    *state.pid.lock().await = Some(pid);

    let app_out = app.clone();
    tokio::spawn(async move {
        let mut reader = TokioBufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_out.emit("run:output", OutputPayload { stream: "stdout", data: format!("{line}\n") });
        }
    });

    let app_err = app.clone();
    tokio::spawn(async move {
        let mut reader = TokioBufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_err.emit("run:output", OutputPayload { stream: "stderr", data: format!("{line}\n") });
        }
    });

    // This task owns `child` for its whole lifetime, so there's no shared
    // mutable access to worry about — stop_run() below kills the OS
    // process directly by pid instead of going through this Child handle.
    let app_exit = app.clone();
    let pid_state = state.pid.clone();
    let stdin_state = state.stdin.clone();
    let run_dir = dir.clone();
    tokio::spawn(async move {
        let code = match child.wait().await {
            Ok(status) => status.code(),
            Err(_) => None,
        };
        *pid_state.lock().await = None;
        *stdin_state.lock().await = None;
        let _ = std::fs::remove_dir_all(&run_dir);
        let _ = app_exit.emit("run:exit", ExitPayload { code });
    });

    Ok(())
}

#[tauri::command]
async fn write_stdin(state: tauri::State<'_, RunState>, data: String) -> Result<(), String> {
    let mut guard = state.stdin.lock().await;
    match guard.as_mut() {
        Some(stdin) => {
            stdin.write_all(data.as_bytes()).await.map_err(|e| format!("Failed to write to stdin: {e}"))?;
            stdin.flush().await.map_err(|e| format!("Failed to flush stdin: {e}"))?;
            Ok(())
        }
        None => Err("No program is currently running.".into()),
    }
}

#[tauri::command]
async fn stop_run(state: tauri::State<'_, RunState>) -> Result<(), String> {
    let pid = *state.pid.lock().await;
    if let Some(pid) = pid {
        kill_tree(pid);
    }
    // state.pid / state.stdin are cleared by run_code's wait task once the
    // OS confirms the process has actually exited, and run:exit fires then.
    Ok(())
}

#[tauri::command]
async fn preview_html(app: AppHandle, req: PreviewRequest) -> Result<(), String> {
    let entry_rel = sanitize_rel_path(&req.entry).ok_or_else(|| "Invalid entry file path.".to_string())?;
    let dir = materialize_workspace("fareide-preview", &req.files)?;
    let entry_abs = dir.join(&entry_rel);

    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(entry_abs.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Couldn't open the browser: {e}"))?;

    Ok(())
}

// ── App entry ────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(RunState::default())
        .invoke_handler(tauri::generate_handler![run_code, write_stdin, stop_run, preview_html])
        .run(tauri::generate_context!())
        .expect("error while running the FareIDE application");
}
