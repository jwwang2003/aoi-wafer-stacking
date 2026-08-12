# Test fixtures

Canonical example data for both test suites (Rust `cargo test` and TypeScript
`pnpm test`). Everything in here is the single source of truth — do not add
copies of these files elsewhere (the old `src-tauri/static/` copies were
removed in favor of this directory).

## Layout

```
fixtures/
├── parser/          One minimal sample per supported file format.
│                    Used by src-tauri/src/parser/tests and file/tests.
│   ├── fab-cp-wafer.txt        FAB CP wafer map (parse_wafer)
│   ├── wafer-mapEx.txt         CP-prober mapEx (parse_wafer_map_data)
│   ├── wlbi-bin.WaferMap       WLBI binary map (parse_wafer_bin)
│   ├── substrate-defect.xls    Substrate defect list (parse_substrate_defect_xls)
│   ├── product-list.xlsx       Product records (parse_product_xls)
│   ├── product-mapping.xlsx    OEM↔product mapping (parse_product_mapping_xls)
│   └── die-layout.xlsx         基板布局 (parse_die_layout_xls); GENERATED —
│                               one sheet per fixture product, derived from
│                               the parsed CP1 layers so alignment markers
│                               match the wafer maps. Regenerate with:
│                               python3 test/fixtures/tools/generate_die_layout.py
│                               Also usable as the app's 基板布局 Excel
│                               preference when testing manually.
│
├── lots/            Coherent cross-stage lots: the same wafer measured at
│   │                every stage. Input for stacking-pipeline tests.
│   ├── B003332/     Wafers 01+02: fab-cp/ cp1/ cp2/ wlbi/ aoi/ substrate/
│   └── B003990/     Wafer 02:     fab-cp/ cp1/ cp2/ wlbi/ aoi/ substrate/
│
├── parsed/          JSON dumps of the lot layers, produced by the Rust
│   │                parsers and consumed by the vitest suite (test/unit/).
│   │                Serialized with the same serde definitions Tauri IPC
│   │                uses, so tests see exactly what production code gets
│   │                from invoke().
│   ├── B003332/     fab-cp.json cp1.json cp2.json wlbi.json aoi.json
│   └── B003990/     ... + substrate-defects.json
│
└── scan-tree/       Slim directory tree in the exact production share
                     layout (AOI-01/, CP-prober-01/, FAB CP/, WLBI-02/,
                     Substrate/...). Multi-product: CP-prober-01 holds lots
                     from two products (S1M040120B/B003990 and
                     SZ4MA25120BK/HL9188), and Substrate carries record
                     sheets and defect lists for both. The SZ4MA25120BK
                     wafers deliberately keep the three real-world file
                     naming variants (plain, dash, dot) — only the plain
                     variant matches SCAN_PATTERNS.cpProber.mapExFile, and
                     the tests in test/unit/scanTreeLayout.test.ts pin that
                     behavior. Used to test folder/file-name patterns; also
                     usable as a data source root when running the app
                     manually.
```

## Regenerating `parsed/`

Whenever a Rust parser changes behavior on purpose:

```bash
cd src-tauri
cargo test --no-default-features dump_parsed_fixtures -- --ignored
```

Then re-run `pnpm test` and review/update the vitest snapshots
(`pnpm vitest run -u`) — the diff in `parsed/` and the snapshot changes are
the reviewable record of the behavior change.

## Adding a new lot

1. Create `lots/<LOT>/` with one folder per stage (`fab-cp`, `cp1`, `cp2`,
   `wlbi`, `aoi`, `substrate`) holding the raw machine files.
2. Add the corresponding `write_json` calls to `dump_parsed_fixtures` in
   `src-tauri/src/parser/tests/mod.rs` and regenerate.
3. Add the lot id to the `describe.each([...])` lists in `test/unit/`.
