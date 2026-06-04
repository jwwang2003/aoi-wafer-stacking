# AOI Wafer Stacking (清纯AOI优化与叠图)

AOI Wafer Stacking is a Sichain desktop app for wafer map viewing, multi-stage wafer stacking, substrate defect overlay, export generation, and optional TorchScript AOI inference.

Current release: `v1.0.10`

## Stack

- Tauri 2 + Rust backend
- React 19 + TypeScript + Redux Toolkit
- Mantine UI
- Three.js wafer/substrate rendering
- Vitest unit tests
- Optional LibTorch/TorchScript AOI backend

## Features

- Configure and scan wafer data source folders for Substrate, FAB CP, CP-prober, WLBI, and AOI files.
- Ingest wafer metadata into the local SQLite database.
- Select wafer stacking layers and defect/bin classes per job.
- Process single jobs or queued batch jobs.
- Export stacked wafer outputs as WaferMapEx, BinMap, HexMap, image, FAB, and SILAN formats.
- Store wafer stacking statistics and export stats reports.
- Run AOI TorchScript inference when built with LibTorch resources.

## Project Structure

```text
src/
  api/                 Tauri command wrappers
  components/          Shared React UI components
  db/                  SQLite access helpers
  pages/               App pages and page-local modules
    WaferStacking/
      index.tsx        Wafer stacking UI and queue/status wiring
      jobProcessor.ts  Job orchestration service
      outputHandler.ts Output export orchestration
      stackingLayers.ts Layer alignment/merge helpers
  slices/              Redux slices
  types/               Shared TypeScript types
  utils/               Parsing, rendering, filesystem, and report helpers
src-tauri/
  src/                 Rust backend
  Cargo.toml           Tauri/Rust manifest
  tauri*.conf.json     Platform/build configuration
test/
  reference_files/     Compact wafer-stacking fixture set
  data1/, data2/       Larger realistic sample data folders
```

## Branches

- `main`: release-ready branch.
- `dev-algo`: development branch kept in sync with `main` after release integration.
- `codex/*`: short-lived working branches.

## Setup

Install dependencies from the lockfile:

```bash
pnpm install --frozen-lockfile
```

Run the web frontend only:

```bash
pnpm dev
```

Run the Tauri app in development mode with default features:

```bash
pnpm run tauri -- dev
```

Run without LibTorch/AOI inference:

```bash
pnpm run tauri -- dev -- --no-default-features
```

## Verification

Use these before merging or preparing a release:

```bash
pnpm run test:unit
pnpm run eslint
pnpm run build
cd src-tauri
cargo test --no-default-features
```

The current `v1.0.10` release prep passed:

- `tsc --noEmit`
- `vitest run` / `pnpm run test:unit`: 34 tests
- `eslint ./src`
- `cargo test --no-default-features`: 13 tests
- `pnpm run build`

## Building

Build the frontend:

```bash
pnpm run build
```

Build the Tauri app with default features. This requires a valid LibTorch install because `src-tauri/Cargo.toml` enables `libtorch` by default.

```bash
pnpm run tauri -- build
```

Here `build` is the Tauri subcommand. Do not write `--build`; Tauri will treat that as an unknown top-level option.

Build the Tauri app without LibTorch/AOI inference:

```bash
pnpm run tauri -- build --no-bundle -- --no-default-features
```

The first `--` separates `pnpm run` from the script arguments. The second `--` separates Tauri options from Cargo runner arguments.

On Windows, MSI bundling uses WiX:

```bash
pnpm run tauri -- build --bundles msi
```

For a no-LibTorch MSI build, pass the Cargo feature flag after the second separator:

```bash
pnpm run tauri -- build --bundles msi -- --no-default-features
```

If the app binary builds but MSI packaging fails in WiX `light.exe`, verify the local WiX toolchain and bundle resources. The no-bundle command above can still produce `src-tauri/target/release/aoi-wafer-stacking.exe`.

On macOS, build a DMG bundle:

```bash
pnpm run tauri -- build --bundles dmg
```

## Release Checklist

1. Keep `main` and `dev-algo` up to date with `origin`.
2. Bump the app version consistently in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
3. Run the verification commands above.
4. Merge the release branch into `main`.
5. Update `dev-algo` from `main`.
6. Create an annotated tag, for example:

```bash
git tag -a v1.0.10 -m "Release v1.0.10"
git push origin main dev-algo v1.0.10
```

## Data Source Regex Defaults

The folder auto-recognition defaults live in `src/constants/default.ts`.

| Data source | Default regex |
| --- | --- |
| Substrate | `Substrate` |
| FAB CP | `FAB CP` |
| CP-prober | `CP-prober-[A-Za-z0-9]+` |
| WLBI | `WLBI-[A-Za-z0-9]+` |
| AOI | `AOI-[A-Za-z0-9]+` |

Matching is performed against folder names. These defaults can be changed in the app configuration UI.

## Database

The SQLite database is stored in the app data directory as `data.db`.

On Windows this is under `%APPDATA%` for the Tauri app. The exact path depends on the app identifier and runtime environment.

## Admin Password

The seeded admin password is `admin`.

To override the first-run/default admin password during initialization, create a local `.env` file at the project root:

```text
VITE_ADMIN_DEFAULT_PASSWORD=your-secret
```

If the database still uses the seed password, the app updates it to the env value during initialization. Do not commit `.env`.

## Icons

Generate Tauri icons from a source image:

```bash
pnpm run tauri -- icon --help
pnpm run tauri -- icon public/logo3.png
```

## PyTorch / LibTorch

AOI inference is behind the `libtorch` Cargo feature, which is enabled by default.

### macOS ARM Tauri Bundle

Download the official `libtorch-macos-arm64` zip from PyTorch and unpack it into `src-tauri/libtorch/` so the directory contains `src-tauri/libtorch/lib/libtorch.dylib`, `libtorch_cpu.dylib`, and related libraries.

If you built LibTorch locally at `3rdparty/pytorch/build/install`, copy or symlink it into place:

```bash
ln -snf ../3rdparty/pytorch/build/install src-tauri/libtorch
```

Build with the bundled libraries:

```bash
cd src-tauri
LIBTORCH=./libtorch \
RUSTFLAGS="-C link-args=-Wl,-rpath,@executable_path/../Resources/libtorch/lib" \
cargo tauri build --target aarch64-apple-darwin
```

Add `LIBTORCH_BYPASS_VERSION_CHECK=1` if the local LibTorch version check blocks a known-good build.

Verify the bundle can see the libraries:

```bash
otool -l target/release/bundle/macos/AOI\ Wafer\ Stacking.app/Contents/MacOS/aoi-wafer-stacking | rg LC_RPATH
ls target/release/bundle/macos/AOI\ Wafer\ Stacking.app/Contents/Resources/libtorch/lib
```

If codesign complains, run from `src-tauri`:

```bash
codesign --force --deep --sign - target/release/bundle/macos/AOI\ Wafer\ Stacking.app
```

### macOS Dev Using Python Torch

```bash
export LIBTORCH_BYPASS_VERSION_CHECK=1
export LIBTORCH_USE_PYTORCH=1
torch_lib=$(python - <<'PY'
import os
import torch
print(os.path.join(os.path.dirname(torch.__file__), 'lib'))
PY
)
export LIBTORCH="$torch_lib"
export DYLD_LIBRARY_PATH="$torch_lib:${DYLD_LIBRARY_PATH}"
pnpm run tauri -- dev
```

### Building LibTorch From Source

Refer to PyTorch's build-from-source guidance for platform-specific prerequisites.

```bash
git submodule init
git submodule update --recursive
cd 3rdparty/pytorch
export BUILD_TEST=0
export USE_DISTRIBUTED=0
export USE_CUDA=0
export USE_MPS=0
export DEBUG=0
python tools/build_libtorch.py
```

Manual CMake flow:

```bash
mkdir -p build
cd build
cmake .. \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PWD/install" \
  -DBUILD_SHARED_LIBS=ON \
  -DBUILD_PYTHON=OFF \
  -DBUILD_TEST=OFF \
  -DUSE_CUDA=OFF \
  -DUSE_MPS=OFF \
  -DUSE_DISTRIBUTED=OFF
cmake --build . --target install -j"$(sysctl -n hw.ncpu)"
```

## References

- https://www.sichainsemi.com/
- https://v2.tauri.app/start/
- https://react.dev/
- https://react-redux.js.org/
- https://mantine.dev/
- https://threejs.org/
- https://github.com/tabler/tabler-icons/

## Authors

- JUN WEI WANG | [jwwang2003](https://github.com/jwwang2003/)
- YI TING | [ee731](https://github.com/ee731)
