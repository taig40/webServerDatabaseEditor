// rAthena Web Editor — Tauri v2 Application Library
//
// Initializes the Tauri application with dialog and shell plugins.
// Spawns the FastAPI backend as a sidecar process on startup and
// ensures it is terminated when the application exits.

use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::Mutex;

/// Holds the sidecar child process handle so it can be killed on app exit.
struct SidecarState(Mutex<Option<CommandChild>>);

/// Spawns the FastAPI sidecar backend binary and stores its handle in app state.
///
/// The sidecar is launched with `--host 127.0.0.1 --port 8000` arguments.
/// stdout/stderr are piped and logged to the Tauri console for debugging.
fn spawn_sidecar(app: &tauri::AppHandle) {
    let shell = app.shell();

    let sidecar_cmd = shell
        .sidecar("rathena-sde-backend")
        .expect("[Tauri] Failed to create sidecar command for rathena-sde-backend");

    let (mut _rx, child) = sidecar_cmd
        .args(["--host", "127.0.0.1", "--port", "8000"])
        .spawn()
        .expect("[Tauri] Failed to spawn FastAPI sidecar process");

    println!("[Tauri] FastAPI sidecar started (PID: {:?})", child.pid());

    // Store the child handle for cleanup on exit
    let state = app.state::<SidecarState>();
    let mut guard = state.0.lock().expect("Failed to lock sidecar state");
    *guard = Some(child);

    // Spawn a background thread to consume sidecar stdout/stderr events
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = _rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    print!("[Backend] {}", text);
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    eprint!("[Backend ERR] {}", text);
                }
                CommandEvent::Terminated(payload) => {
                    println!(
                        "[Tauri] Sidecar terminated (code: {:?}, signal: {:?})",
                        payload.code, payload.signal
                    );
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

/// Kills the sidecar process if it is still running.
fn kill_sidecar(app: &tauri::AppHandle) {
    let state = app.state::<SidecarState>();
    let mut guard = state.0.lock().expect("Failed to lock sidecar state");
    if let Some(child) = guard.take() {
        println!("[Tauri] Killing FastAPI sidecar process...");
        let _ = child.kill();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            spawn_sidecar(&handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                kill_sidecar(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("[Tauri] Fatal error while building the application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                kill_sidecar(app);
            }
        });
}
