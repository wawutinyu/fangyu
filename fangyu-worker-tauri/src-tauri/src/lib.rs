//! 方隅 — 桌面原生壳（Tauri）
//! 主窗口 = 序 UI（与 Web 1:1，同一套 fangyu-studio）
//! 托盘 = 拉起 Worker；启动时拉起本机 API
//! Windows / macOS 共用；配置目录见 fangyu_config_dir()

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State,
};
use tauri_plugin_autostart::ManagerExt;

struct AppState {
    worker: Mutex<Option<Child>>,
    api: Mutex<Option<Child>>,
    worker_dir: PathBuf,
    repo_root: PathBuf,
    data_dir: PathBuf,
    api_base: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct NativeConfig {
    #[serde(default)]
    repo_root: Option<String>,
    #[serde(default)]
    data_dir: Option<String>,
}

fn fangyu_config_dir() -> PathBuf {
    // Windows: %LOCALAPPDATA%\Fangyu
    // macOS: ~/Library/Application Support/Fangyu
    // Linux: ~/.config/Fangyu
    if let Ok(raw) = std::env::var("LOCALAPPDATA") {
        let p = PathBuf::from(raw);
        if !p.as_os_str().is_empty() {
            return p.join("Fangyu");
        }
    }
    if cfg!(target_os = "macos") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("Fangyu");
        }
    }
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        let p = PathBuf::from(xdg);
        if !p.as_os_str().is_empty() {
            return p.join("Fangyu");
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join(".config").join("Fangyu");
    }
    PathBuf::from(".").join("Fangyu")
}

fn native_config_path() -> PathBuf {
    fangyu_config_dir().join("native.json")
}

fn load_native_config() -> NativeConfig {
    let path = native_config_path();
    match std::fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => NativeConfig::default(),
    }
}

fn save_native_config(cfg: &NativeConfig) {
    let dir = fangyu_config_dir();
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(raw) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(native_config_path(), raw);
    }
}

fn looks_like_repo(path: &PathBuf) -> bool {
    path.join("fangyu-worker")
        .join("src")
        .join("cli.mjs")
        .exists()
}

fn resolve_repo_root() -> PathBuf {
    if let Ok(raw) = std::env::var("FANGYU_REPO_ROOT") {
        let p = PathBuf::from(raw.trim());
        if looks_like_repo(&p) {
            return p;
        }
        eprintln!(
            "[方隅] FANGYU_REPO_ROOT 无效（缺 fangyu-worker）: {}",
            p.display()
        );
    }
    let cfg = load_native_config();
    if let Some(raw) = cfg.repo_root.as_deref() {
        let p = PathBuf::from(raw.trim());
        if looks_like_repo(&p) {
            return p;
        }
        eprintln!("[方隅] native.json repo_root 无效: {}", p.display());
    }
    if let Ok(cwd) = std::env::current_dir() {
        if looks_like_repo(&cwd) {
            return cwd;
        }
        if let Some(parent) = cwd.parent() {
            let parent = parent.to_path_buf();
            if looks_like_repo(&parent) {
                return parent;
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [
                dir.to_path_buf(),
                dir.join("resources"),
                dir.join("..").join("..").join("..").join(".."),
                dir.join("..").join("..").join("..").join("..").join(".."),
            ] {
                if let Ok(canon) = candidate.canonicalize() {
                    if looks_like_repo(&canon) {
                        return canon;
                    }
                } else if looks_like_repo(&candidate) {
                    return candidate;
                }
            }
        }
    }
    PathBuf::from("..")
}

fn resolve_data_dir(repo: &PathBuf) -> PathBuf {
    if let Ok(raw) = std::env::var("FANGYU_DATA_DIR") {
        let p = PathBuf::from(raw.trim());
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    let cfg = load_native_config();
    if let Some(raw) = cfg.data_dir.as_deref() {
        let p = PathBuf::from(raw.trim());
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    if looks_like_repo(repo) {
        return repo.join("data");
    }
    fangyu_config_dir().join("data")
}

fn resolve_worker_dir(repo: &PathBuf) -> PathBuf {
    let candidate = repo.join("fangyu-worker");
    if candidate.join("src").join("cli.mjs").exists() {
        return candidate;
    }
    PathBuf::from("../fangyu-worker")
}

fn python_executable(repo: &Path) -> PathBuf {
    let venv = if cfg!(windows) {
        repo.join(".venv").join("Scripts").join("python.exe")
    } else {
        repo.join(".venv").join("bin").join("python3")
    };
    if venv.exists() {
        return venv;
    }
    if cfg!(windows) {
        PathBuf::from("py")
    } else {
        PathBuf::from("python3")
    }
}

fn hide_console(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

fn api_healthy(api_base: &str) -> bool {
    let port: u16 = api_base
        .rsplit(':')
        .next()
        .and_then(|s| s.trim_end_matches('/').parse().ok())
        .unwrap_or(8000);
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
}

fn start_api(state: &AppState) -> Result<(), String> {
    if api_healthy(&state.api_base) {
        return Ok(());
    }
    let mut slot = state.api.lock().map_err(|e| e.to_string())?;
    if let Some(child) = slot.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Ok(());
        }
    }

    let _ = std::fs::create_dir_all(&state.data_dir);

    let mut cmd = Command::new(python_executable(&state.repo_root));
    cmd.args(["-m", "fangyu", "--server"])
        .current_dir(&state.repo_root)
        .env("HOST", "127.0.0.1")
        .env("PORT", "8000")
        .env("RELOAD", "false")
        .env("FANGYU_DATA_DIR", &state.data_dir)
        .env("FANGYU_REPO_ROOT", &state.repo_root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console(&mut cmd);

    let child = cmd
        .spawn()
        .map_err(|e| format!("启动 API 失败（需已安装 Python/fangyu）: {e}"))?;
    *slot = Some(child);

    for _ in 0..40 {
        if api_healthy(&state.api_base) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err("API 启动超时".into())
}

fn stop_api(state: &AppState) {
    if let Ok(mut slot) = state.api.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn restart_api(state: &AppState) -> Result<(), String> {
    stop_api(state);
    start_api(state)
}

fn start_worker(state: &AppState) -> Result<(), String> {
    let mut slot = state.worker.lock().map_err(|e| e.to_string())?;
    if let Some(child) = slot.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Ok(());
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
        .env("FANGYU_REPO_ROOT", &state.repo_root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console(&mut cmd);
    let child = cmd.spawn().map_err(|e| format!("启动 Worker 失败: {e}"))?;
    *slot = Some(child);
    Ok(())
}

fn stop_worker(state: &AppState) {
    if let Ok(mut slot) = state.worker.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn restart_worker(state: &AppState) -> Result<(), String> {
    stop_worker(state);
    start_worker(state)
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn install_hint() -> &'static str {
    if cfg!(windows) {
        "install-native.bat"
    } else {
        "./install-native.sh"
    }
}

#[tauri::command]
fn worker_status(state: State<'_, AppState>) -> String {
    let mut slot = match state.worker.lock() {
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
fn api_status(state: State<'_, AppState>) -> String {
    if api_healthy(&state.api_base) {
        "running".into()
    } else {
        "down".into()
    }
}

#[tauri::command]
fn restart_worker_cmd(state: State<'_, AppState>) -> Result<(), String> {
    restart_worker(&state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let api_base =
        std::env::var("FANGYU_API_BASE").unwrap_or_else(|_| "http://127.0.0.1:8000".into());
    let repo_root = resolve_repo_root();
    let data_dir = resolve_data_dir(&repo_root);
    let worker_dir = resolve_worker_dir(&repo_root);

    if looks_like_repo(&repo_root) {
        let mut cfg = load_native_config();
        cfg.repo_root = Some(repo_root.display().to_string());
        if cfg.data_dir.is_none() {
            cfg.data_dir = Some(data_dir.display().to_string());
        }
        save_native_config(&cfg);
    } else {
        eprintln!(
            "[方隅] 未找到仓库根（需 fangyu-worker）。请运行 {} 或设置 FANGYU_REPO_ROOT。当前: {}",
            install_hint(),
            repo_root.display()
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            worker: Mutex::new(None),
            api: Mutex::new(None),
            worker_dir,
            repo_root: repo_root.clone(),
            data_dir,
            api_base: api_base.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            worker_status,
            api_status,
            restart_worker_cmd
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let state = handle.state::<AppState>();

            if looks_like_repo(&state.repo_root) {
                if let Err(e) = start_api(&state) {
                    eprintln!("[方隅] API: {e}");
                }
                if let Err(e) = start_worker(&state) {
                    eprintln!("[方隅] Worker: {e}");
                }
            }

            if let Some(w) = app.get_webview_window("main") {
                let title = if looks_like_repo(&state.repo_root) {
                    "方隅".to_string()
                } else {
                    format!("方隅（未绑定仓库 — 请运行 {}）", install_hint())
                };
                let _ = w.set_title(&title);
                let _ = w.show();
            }

            let show_i =
                MenuItem::with_id(app, "show_main", "打开方隅（序）", true, None::<&str>)?;
            let restart_api_i =
                MenuItem::with_id(app, "restart_api", "重启 API", true, None::<&str>)?;
            let restart_i = MenuItem::with_id(
                app,
                "restart_worker",
                "重启 Worker（行）",
                true,
                None::<&str>,
            )?;
            let autostart_i =
                MenuItem::with_id(app, "toggle_autostart", "开机自启（切换）", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&show_i, &restart_api_i, &restart_i, &autostart_i, &sep, &quit_i],
            )?;

            let _tray = TrayIconBuilder::with_id("fangyu-tray")
                .tooltip("方隅")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show_main" => show_main(app),
                    "restart_api" => {
                        let state = app.state::<AppState>();
                        if let Err(e) = restart_api(&state) {
                            eprintln!("[方隅] 重启 API 失败: {e}");
                        }
                    }
                    "restart_worker" => {
                        let state = app.state::<AppState>();
                        if let Err(e) = restart_worker(&state) {
                            eprintln!("[方隅] 重启 Worker 失败: {e}");
                        }
                    }
                    "toggle_autostart" => {
                        let mgr = app.autolaunch();
                        match mgr.is_enabled() {
                            Ok(true) => {
                                if let Err(e) = mgr.disable() {
                                    eprintln!("[方隅] 关闭开机自启失败: {e}");
                                } else {
                                    eprintln!("[方隅] 已关闭开机自启");
                                }
                            }
                            Ok(false) => {
                                if let Err(e) = mgr.enable() {
                                    eprintln!("[方隅] 开启开机自启失败: {e}");
                                } else {
                                    eprintln!("[方隅] 已开启开机自启");
                                }
                            }
                            Err(e) => eprintln!("[方隅] 开机自启状态: {e}"),
                        }
                    }
                    "quit" => {
                        let state = app.state::<AppState>();
                        stop_worker(&state);
                        stop_api(&state);
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
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running fangyu native");
}
