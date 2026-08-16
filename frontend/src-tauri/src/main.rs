// rAthena Web Editor — Tauri v2 Desktop Entry Point
//
// This is the Windows desktop entry point. It delegates to lib.rs
// which contains the full Tauri application setup.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rathena_web_editor_lib::run()
}
