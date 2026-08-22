// rAthena Web Editor — Tauri v2 Application Library
//
// Initializes the Tauri application with dialog and shell plugins.
// Spawns the FastAPI backend as a sidecar process on startup and
// ensures it is terminated when the application exits.
//
// Cleanup strategy:
//   - The child PID is stored separately from the CommandChild handle.
//   - On RunEvent::ExitRequested, we force-kill via the OS (taskkill /F on
//     Windows, kill -9 on Unix) to guarantee the Python/uvicorn process dies
//     even when it ignores normal signals.
//   - The CommandChild handle is kept alive in SidecarState so the Tauri
//     Shell plugin does not drop/orphan the process before we are ready.

use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::Mutex;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/// Holds both the CommandChild (Tauri handle) and the raw OS pid.
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
    pid:   Mutex<Option<u32>>,
}

impl SidecarState {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
            pid:   Mutex::new(None),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Force-kills the sidecar process by PID using OS APIs.
///
/// On Windows we use `taskkill /F /PID` because `TerminateProcess` signals
/// sent via Tauri's `CommandChild::kill()` are sometimes ignored by
/// PyInstaller-packed executables that have their own signal handlers.
fn force_kill_by_pid(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGKILL);
        }
    }
}

/// Terminates the sidecar: drops the CommandChild first (closes pipes), then
/// force-kills by PID so the port is released immediately.
fn kill_sidecar(app: &tauri::AppHandle) {
    let state = app.state::<SidecarState>();

    // 1. Drop the Tauri child handle (closes stdin/stdout pipes).
    let maybe_child = state.child.lock().ok().and_then(|mut g| g.take());
    if let Some(child) = maybe_child {
        println!("[Tauri] Sending kill signal to sidecar...");
        let _ = child.kill();
    }

    // 2. Force-kill by PID to guarantee the OS process is gone.
    let maybe_pid = state.pid.lock().ok().and_then(|mut g| g.take());
    if let Some(pid) = maybe_pid {
        println!("[Tauri] Force-killing sidecar PID {}...", pid);
        force_kill_by_pid(pid);
    }
}

// ---------------------------------------------------------------------------
// Sidecar lifecycle
// ---------------------------------------------------------------------------

/// Spawns the FastAPI sidecar binary, stores its handle + PID in app state,
/// and starts a background task that consumes stdout/stderr events.
///
/// If the sidecar exits with code 3 (triggered by `/api/setup` after the
/// first-time configuration), it is automatically restarted.
fn spawn_sidecar(app: &tauri::AppHandle) {
    let shell = app.shell();

    let sidecar_cmd = shell
        .sidecar("rathena-sde-backend")
        .expect("[Tauri] Failed to create sidecar command for rathena-sde-backend");

    let (mut rx, child) = sidecar_cmd
        .args(["--host", "127.0.0.1", "--port", "8000"])
        .spawn()
        .expect("[Tauri] Failed to spawn FastAPI sidecar process");

    let pid = child.pid();
    println!("[Tauri] FastAPI sidecar started (PID: {})", pid);

    // Store both the child handle and the PID.
    {
        let state = app.state::<SidecarState>();
        *state.child.lock().expect("lock child") = Some(child);
        *state.pid.lock().expect("lock pid")     = Some(pid);
    }

    let app_handle = app.clone();

    // Consume sidecar I/O events in the async runtime.
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    print!("[Backend] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprint!("[Backend ERR] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    println!(
                        "[Tauri] Sidecar terminated (code: {:?}, signal: {:?})",
                        payload.code, payload.signal
                    );
                    // Exit code 3 → /api/setup asked for a restart.
                    if payload.code == Some(3) {
                        println!("[Tauri] Restarting sidecar (setup complete)...");
                        spawn_sidecar(&app_handle);
                    }
                    break;
                }
                CommandEvent::Error(err) => {
                    eprintln!("[Tauri] Sidecar error: {}", err);
                    break;
                }
                _ => {}
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState::new())
        .setup(|app| {
            spawn_sidecar(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("[Tauri] Fatal error while building the application")
        .run(|app, event| {
            // ExitRequested fires before the process exits — ideal hook for
            // blocking cleanup. Exit fires afterwards as a safety net.
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                kill_sidecar(app);
            }
        });
}
