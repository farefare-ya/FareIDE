// Prevents an extra console window from popping up on Windows in release
// builds. DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fareide_lib::run();
}
