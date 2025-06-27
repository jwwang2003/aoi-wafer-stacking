# Wafer Overlay (智能叠图)

> This was a built using [Tauri V2](https://v2.tauri.app/start/) with `yarn create tauri-app`.

**Development stack**
- [Tauri](https://v2.tauri.app/start/): Tauri + React + Typescript
- [Mantine](https://mantine.dev/): GUI library for React
- [ThreeJS](https://threejs.org/): JS-based 3D library for accurate drawing of wafers
- Rust Backend

**IDE setup:**

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Project structure

### Branches

### Folder structure

## Screenshots & demo

## Pre-compiled binaries

## Building

## Developer notes

### Creating icons

```
yarn tauri icon --help
yarn tauri icon public/logo3.png
```

### 文件夹与文件正则表达式

| 文件夹 | 正则表达式 |
| -------- | ------------------------------- |
| 衬底       | `(?<=[/\\])衬底(?=[/\\])`         |
| FAB CP   | `(?<=[/\\])FAB\s*CP(?=[/\\])`   |
| CP 1     | `(?<=[/\\])CP\s*1(?=[/\\])`     |
| WLBI MAP | `(?<=[/\\])WLBI\s*MAP(?=[/\\])` |
| CP 2     | `(?<=[/\\])CP\s*2(?=[/\\])`     |
| AOI      | `(?<=[/\\])AOI(?=[/\\])`        |

## References (libraries, dependencies, papers, etc.)

- https://www.sichainsemi.com/
- https://v2.tauri.app/start/
- https://react-redux.js.org/
- https://threejs.org/
- https://github.com/0xtaruhi/ufde-next/
- https://github.com/tabler/tabler-icons/

## Authors

- JUN WEI WANG | [jwwang2003](https://github.com/jwwang2003/)
- YI TING | [ee731](https://github.com/ee731)