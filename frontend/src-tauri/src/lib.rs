// rAthena Web Editor — Tauri v2 Application Library
//
// Initializes the Tauri application with dialog and shell plugins.
// Spawns the FastAPI backend as a sidecar process on startup and
// ensures it is terminated when the application exits.
//
// Cleanup strategy (Windows):
//   PyInstaller onefile executables run as TWO processes:
//     PID X: rathena-sde-backend.exe (bootloader) — what we track
//     PID Y: rathena-sde-backend.exe (Python interpreter) — child of X
//
//   The ORDER of kill operations is critical:
//     1. taskkill /F /T /PID X  — kills X and all children while X is alive.
//        /T traverses the process tree in a toolhelp32 snapshot; if X is
//        already dead the snapshot won't list X's children (they're orphans).
//     2. taskkill /F /IM rathena-sde-backend.exe — belt-and-suspenders fallback
//        that kills any surviving instance by image name.
//     3. child.kill()  — drops Tauri's internal process handle (may be no-op).
//
//   If we call child.kill() (TerminateProcess) first, X dies before step 1
//   runs, Y becomes an orphan, and taskkill /T can no longer discover it.
//
//   The `shutting_down` AtomicBool is set to `true` before any kill operation
//   so the async event-consumer task never restarts the process on shutdown.

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
    /// Raw OS PID — used for tree-kill before the Tauri handle is dropped.
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

/// Force-kills the sidecar process tree using OS-level APIs.
///
/// Must be called while the parent process is still alive so that the OS
/// process-tree snapshot includes its children.
fn force_kill_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        // Step 1: kill the entire tree (parent + all descendants).
        // This MUST happen before child.kill() / TerminateProcess so the
        // parent (bootloader) is still alive when taskkill takes its snapshot.
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();

        // Step 2: belt-and-suspenders — kill any surviving instance by name.
        // Handles edge cases where the child became an orphan before step 1.
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "rathena-sde-backend.exe"])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGKILL);
        }
    }
}

/// Sets the shutdown flag then terminates the sidecar process tree.
///
/// Ordering is critical:
///   1. Set `shutting_down` so the async task skips the restart logic.
///   2. Extract PID from state.
///   3. Extract child handle from state.
///   4. Run `force_kill_tree(pid)` — kills tree while parent is alive.
///   5. Drop the Tauri child handle (child.kill) — releases Shell plugin resources.
fn kill_sidecar(app: &tauri::AppHandle) {
    let state = app.state::<SidecarState>();

    // 1. Signal the async task to never restart after this point.
    state.shutting_down.store(true, Ordering::SeqCst);

    // 2 & 3. Extract both handles atomically before any kill call.
    //    PID is extracted first so it is available for the tree-kill even
    //    if the child handle extraction has any issue.
    let maybe_pid   = state.pid.lock().ok().and_then(|mut g| g.take());
    let maybe_child = state.child.lock().ok().and_then(|mut g| g.take());

    // 4. Tree-kill FIRST — parent (bootloader) must still be alive.
    if let Some(pid) = maybe_pid {
        println!("[Tauri] Force-killing sidecar tree (PID {})...", pid);
        force_kill_tree(pid);
        println!("[Tauri] Sidecar tree killed.");
    }

    // 5. Drop the Tauri child handle last (process is already dead at this point).
    if let Some(child) = maybe_child {
        let _ = child.kill();
    }
}

// ---------------------------------------------------------------------------
// Sidecar lifecycle
// ---------------------------------------------------------------------------

/// Spawns the FastAPI sidecar binary, stores its handle + PID in app state,
/// and starts an async task that consumes stdout/stderr events.
///
/// **Restart on exit code 3**: When `/api/setup` finishes writing
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

    // Store both the child handle and the PID.
    // Reset shutting_down so the new instance can be restarted after code-3.
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

                    // Restart ONLY for the setup sentinel (code 3) AND ONLY
                    // when the app is NOT shutting down.
                    // The shutting_down flag is set BEFORE kill_sidecar sends
                    // any kill signal, guaranteeing that this branch is never
                    // taken during app shutdown even if the OS reports an
                    // unexpected exit code.
                    if payload.code == Some(3) {
                        let is_shutting_down = app_handle
                            .state::<SidecarState>()
                            .shutting_down
                            .load(Ordering::SeqCst);

                        if !is_shutting_down {
                            println!("[Tauri] Restarting sidecar (setup complete)...");
                            spawn_sidecar(&app_handle);
                        } else {
                            println!("[Tauri] Shutdown in progress — skipping sidecar restart.");
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
            // ExitRequested fires before the process exits — synchronous cleanup.
            // Exit fires afterwards as a safety net (kill_sidecar is idempotent).
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                kill_sidecar(app);
            }
        });
}
