// rAthena Web Editor — Tauri v2 Application Library
//
// Initializes the Tauri application with dialog and shell plugins.
// Spawns the FastAPI backend as a sidecar process on startup and
// ensures it is terminated when the application exits.
//
// Cleanup strategy:
//   - `shutting_down` AtomicBool is set to true BEFORE killing the sidecar.
//     The async event-consumer task checks this flag before attempting a
//     restart, preventing a "zombie restart" when the OS kill signal causes
//     the process to exit with an exit code that matches our restart sentinel.
//   - The child PID is stored separately from the CommandChild handle so we
//     can force-kill via the OS even after the Tauri handle is dropped.
//   - On Windows we use `taskkill /F /PID` which calls TerminateProcess
//     directly — impossible to intercept by Python signal handlers or the
//     PyInstaller bootloader.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/// Runtime state for the FastAPI sidecar process.
struct SidecarState {
    /// Tauri child handle — keeps the Shell plugin aware of the process.
    child: Mutex<Option<CommandChild>>,
    /// Raw OS PID — used for force-kill after the Tauri handle is dropped.
    pid: Mutex<Option<u32>>,
    /// Set to `true` before any kill call so the event-consumer task never
    /// restarts the process during app shutdown.
    shutting_down: AtomicBool,
}

impl SidecarState {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
            pid: Mutex::new(None),
            shutting_down: AtomicBool::new(false),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Force-kills a process by PID using OS-level APIs.
///
/// * **Windows**: `taskkill /F /T /PID <pid>`
///   - `/F` = force termination (calls TerminateProcess, cannot be ignored)
///   - `/T` = terminate the entire process TREE, including children.
///     This is critical for PyInstaller onefile executables: the .exe we
///     spawn is a bootloader that immediately spawns a second Python
///     interpreter as a child. Without /T, only the bootloader is killed
///     and the Python child survives as an orphan in the background.
/// * **Unix/macOS**: `SIGKILL` via `libc::kill` — also unblockable.
fn force_kill_by_pid(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGKILL);
        }
    }
}

/// Sets the shutdown flag then terminates the sidecar.
///
/// The flag is set **before** any kill call so that the async event-consumer
/// task — which may observe the `Terminated` event on another thread — sees
/// `shutting_down == true` and skips the restart logic.
fn kill_sidecar(app: &tauri::AppHandle) {
    let state = app.state::<SidecarState>();

    // Signal the async task to never restart the process from this point on.
    state.shutting_down.store(true, Ordering::SeqCst);

    // Drop the Tauri child handle (closes stdin/stdout pipes).
    let maybe_child = state.child.lock().ok().and_then(|mut g| g.take());
    if let Some(child) = maybe_child {
        println!("[Tauri] Sending kill signal to sidecar...");
        let _ = child.kill();
    }

    // Force-kill by PID to guarantee the OS process is gone.
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
/// and starts an async task that consumes stdout/stderr events.
///
/// **Restart on exit code 3**: When `/api/setup` finishes writing the
/// `config.conf`, it calls `os._exit(3)` to signal that a backend restart is
/// needed with the new configuration. We detect that code here and re-spawn,
/// **unless** `shutting_down` is already `true` (app is closing).
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

    // Store both the child handle and the PID; reset the shutdown flag so a
    // fresh instance can still be restarted after a code-3 exit.
    {
        let state = app.state::<SidecarState>();
        state.shutting_down.store(false, Ordering::SeqCst);
        *state.child.lock().expect("lock child") = Some(child);
        *state.pid.lock().expect("lock pid") = Some(pid);
    }

    let app_handle = app.clone();

    // Consume sidecar I/O events in the Tauri async runtime.
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

                    // Only restart for the setup sentinel (code 3) AND only
                    // when the app is NOT shutting down.  Without the second
                    // guard, a force-kill during app exit could cause the OS
                    // to report an exit code that triggers a zombie restart.
                    if payload.code == Some(3) {
                        let is_shutting_down = app_handle
                            .state::<SidecarState>()
                            .shutting_down
                            .load(Ordering::SeqCst);

                        if !is_shutting_down {
                            println!("[Tauri] Restarting sidecar (setup complete)...");
                            spawn_sidecar(&app_handle);
                        } else {
                            println!("[Tauri] Shutdown in progress — skipping restart.");
                        }
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
            // ExitRequested fires before the process exits — the ideal hook
            // for synchronous cleanup.  Exit fires afterwards as a safety net.
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                kill_sidecar(app);
            }
        });
}
