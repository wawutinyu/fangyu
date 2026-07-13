//! 方隅·行 — Tauri 托盘壳：拉起 Node Worker，菜单打开序 / 重启 / 退出。

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State,
};
use tauri_plugin_opener::OpenerExt;

struct WorkerState {
    child: Mutex<Option<Child>>,
    worker_dir: PathBuf,
    api_base: String,
    studio_url: String,
}

fn resolve_worker_dir() -> PathBuf {
    // 开发：fangyu-worker-tauri 的上一级仓库根下的 fangyu-worker
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join("fangyu-worker");
        if candidate.join("src").join("cli.mjs").exists() {
            return candidate;
        }
        let candidate = cwd
            .parent()
            .map(|p| p.join("fangyu-worker"))
            .unwrap_or_else(|| cwd.join("fangyu-worker"));
        if candidate.join("src").join("cli.mjs").exists() {
            return candidate;
        }
    }
    // 打包后：相对可执行文件旁的 fangyu-worker（需安装脚本复制）
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("fangyu-worker");
            if candidate.join("src").join("cli.mjs").exists() {
                return candidate;
            }
            let candidate = dir.join("resources").join("fangyu-worker");
            if candidate.join("src").join("cli.mjs").exists() {
                return candidate;
            }
        }
    }
    PathBuf::from("../fangyu-worker")
}

fn start_worker(state: &WorkerState) -> Result<(), String> {
    let mut slot = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = slot.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Ok(()); // already running
        }
    }
    let cli = state.worker_dir.join("src").join("cli.mjs");
    if !cli.exists() {
        return Err(format!("找不到 Worker CLI: {}", cli.display()));
    }
    let mut cmd = Command::new("node");
    cmd.arg(&cli)
        .current_dir(&state.worker_dir)
        .env("FANGYU_API_BASE", &state.api_base)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd.spawn().map_err(|e| format!("启动 node Worker 失败: {e}"))?;
    *slot = Some(child);
    Ok(())
}

fn stop_worker(state: &WorkerState) {
    if let Ok(mut slot) = state.child.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn restart_worker(state: &WorkerState) -> Result<(), String> {
    stop_worker(state);
    start_worker(state)
}

fn open_studio(app: &AppHandle, url: &str) {
    let _ = app.opener().open_url(url, None::<&str>);
}

#[tauri::command]
fn worker_status(state: State<'_, WorkerState>) -> String {
    let mut slot = match state.child.lock() {
        Ok(s) => s,
        Err(_) => return "unknown".into(),
    };
    match slot.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => "running".into(),
            Ok(Some(status)) => format!("exited:{status}"),
            Err(e) => format!("error:{e}"),
        },
        None => "stopped".into(),
    }
}

#[tauri::command]
fn restart_worker_cmd(state: State<'_, WorkerState>) -> Result<(), String> {
    restart_worker(&state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let api_base = std::env::var("FANGYU_API_BASE").unwrap_or_else(|_| "http://127.0.0.1:8000".into());
    let studio_url =
        std::env::var("FANGYU_STUDIO_URL").unwrap_or_else(|_| "http://localhost:5173".into());
    let worker_dir = resolve_worker_dir();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WorkerState {
            child: Mutex::new(None),
            worker_dir,
            api_base,
            studio_url: studio_url.clone(),
        })
        .invoke_handler(tauri::generate_handler![worker_status, restart_worker_cmd])
        .setup(move |app| {
            let handle = app.handle().clone();
            let state = handle.state::<WorkerState>();
            if let Err(e) = start_worker(&state) {
                eprintln!("[方隅·行] {e}");
            }

            let open_i = MenuItem::with_id(app, "open_studio", "打开方隅·序", true, None::<&str>)?;
            let restart_i = MenuItem::with_id(app, "restart", "重启 Worker", true, None::<&str>)?;
            let status_i = MenuItem::with_id(app, "status", "状态窗口", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &restart_i, &status_i, &sep, &quit_i])?;

            let studio = studio_url.clone();
            let _tray = TrayIconBuilder::with_id("fangyu-worker-tray")
                .tooltip("方隅·行 Worker")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open_studio" => open_studio(app, &studio),
                    "restart" => {
                        let state = app.state::<WorkerState>();
                        if let Err(e) = restart_worker(&state) {
                            eprintln!("[方隅·行] 重启失败: {e}");
                        }
                    }
                    "status" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        let state = app.state::<WorkerState>();
                        stop_worker(&state);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let state = app.state::<WorkerState>();
                        open_studio(app, &state.studio_url);
                    }
                })
                .build(app)?;

            // 启动时隐藏主窗口，只留托盘
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.hide();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 关窗口 = 藏起来，不退出托盘
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running fangyu-worker-tauri");
}
