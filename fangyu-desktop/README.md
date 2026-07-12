# 方隅·行（fangyu-desktop 过渡）

**行** — 执行、连接、交付。当前为 Electron 过渡壳，加载 [fangyu-studio](../fangyu-studio) 构建产物 + 内嵌 Python 后端。

> 长期目标：原生 App **`fangyu-worker`**（shell / 文件 / Adapter / Bundle daemon）。  
> 本包在 Worker MVP 就绪后退役。

## 开发

```bash
# 仓库根目录 npm install 一次后
dev-desktop.bat
# 或 npm run dev:desktop
```

## 打包

```bash
npm run build:desktop
```

产物在 `fangyu-desktop/release/`（应用名 **方隅·行**）。
