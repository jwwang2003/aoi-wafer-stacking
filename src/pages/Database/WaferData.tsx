import { useEffect, useMemo, useState } from "react";
import {
    Box, Group, Stack, Title, Divider, Select, TextInput,
    Pagination, Badge, ActionIcon, Tooltip, Text, Button, Skeleton
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch, IconArrowsSort, IconX, IconDownload, IconRefresh } from "@tabler/icons-react";
import { getDb } from "@/db";

type SortDir = "ASC" | "DESC";
type SortKey = "product" | "batch" | "wafer" | "stage" | "time";

const SORT_COLS: Record<SortKey, string> = {
    product: "wm.product_id",
    batch: "wm.batch_id",
    wafer: "wm.wafer_id",
    stage: "wm.stage",
    time: "wm.time",
};

interface TableState {
    page: number;
    pageSize: number;
    sortBy: SortKey;
    sortDir: SortDir;
    // filters
    q: string;            // 文本搜索：product / batch / wafer / sub_id / 路径 / oem_product_id
    stage: string | null; // CP / WLBI / AOI（null 代表全部）
}

const DEFAULT_STATE: TableState = {
    page: 1,
    pageSize: 50,
    sortBy: "time",
    sortDir: "DESC",
    q: "",
    stage: null,
};

type Row = {
    product_id: string;
    oem_product_id: string | null;
    // NEW: whether OEM mapping exists (derived as 0/1 from NOT NULL check)
    has_oem_map: 0 | 1; // NEW
    batch_id: string;
    wafer_id: number;
    sub_id: string | null;
    stage: string | null;
    sub_stage: string | null;
    retest_count: number | null;
    time: number | null;

    // Files / paths
    defect_path: string | null; // substrate_defect.file_path
    map_path: string | null;    // wafer_maps.file_path
    pdm_path: string | null;    // NEW: product_defect_map.file_path

    // FileIndex metadata
    defect_mtime: number | null; // NEW: file_index.last_mtime for defect
    defect_hash: string | null;  // NEW: file_index.file_hash for defect
    map_mtime: number | null;    // NEW: file_index.last_mtime for wafer map
    map_hash: string | null;     // NEW: file_index.file_hash for wafer map
};

async function fetchStages(): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ stage: string }[]>(
        `SELECT DISTINCT stage FROM wafer_maps WHERE stage IS NOT NULL ORDER BY stage ASC`
    );
    return rows.map(r => r.stage);
}

function buildWhere(state: TableState) {
    const wh: string[] = [];
    const params: any[] = [];

    if (state.stage) {
        wh.push(`wm.stage = ?`);
        params.push(state.stage);
    }

    if (state.q) {
        // 跨字段搜索（扩展包含 OEM 映射与 PDM 来源路径）
        wh.push(`(
      wm.product_id LIKE ?
      OR wm.batch_id LIKE ?
      OR CAST(wm.wafer_id AS TEXT) LIKE ?
      OR IFNULL(pdm.sub_id,'') LIKE ?
      OR IFNULL(sd.file_path,'') LIKE ?
      OR IFNULL(wm.file_path,'') LIKE ?
      OR IFNULL(opm.oem_product_id,'') LIKE ?     -- NEW
      OR IFNULL(pdm.file_path,'') LIKE ?          -- NEW
    )`);
        const like = `%${state.q}%`;
        // Existing 6 + NEW 2 = 8 params
        params.push(like, like, like, like, like, like, like, like);
    }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    return { where, params };
}

async function queryCount(state: TableState): Promise<number> {
    const db = await getDb();
    const { where, params } = buildWhere(state);

    const sql = `
    SELECT COUNT(*) AS total
    FROM wafer_maps wm
    LEFT JOIN product_defect_map pdm
      ON pdm.product_id = wm.product_id
     AND pdm.lot_id = wm.batch_id
     AND pdm.wafer_id = CAST(wm.wafer_id AS TEXT)
    LEFT JOIN substrate_defect sd
      ON sd.sub_id = pdm.sub_id
    LEFT JOIN oem_product_map opm
      ON opm.product_id = wm.product_id
    ${where}
  `;
    const rows = await db.select<{ total: number }[]>(sql, params);
    return rows[0]?.total ?? 0;
}

async function queryRows(state: TableState): Promise<Row[]> {
    const db = await getDb();
    const { where, params } = buildWhere(state);
    const sortCol = SORT_COLS[state.sortBy] ?? SORT_COLS.time;

    const sql = `
    SELECT
      wm.product_id,
      opm.oem_product_id,
      CASE WHEN opm.oem_product_id IS NULL THEN 0 ELSE 1 END AS has_oem_map, -- NEW

      wm.batch_id,
      wm.wafer_id,
      pdm.sub_id,
      wm.stage,
      wm.sub_stage,
      wm.retest_count,
      wm.time,

      sd.file_path AS defect_path,
      wm.file_path AS map_path,
      pdm.file_path AS pdm_path, -- NEW

      -- FileIndex for defect file
      fi_sd.last_mtime AS defect_mtime, -- NEW
      fi_sd.file_hash  AS defect_hash,  -- NEW

      -- FileIndex for wafer map file
      fi_map.last_mtime AS map_mtime, -- NEW
      fi_map.file_hash  AS map_hash   -- NEW

    FROM wafer_maps wm
    LEFT JOIN product_defect_map pdm
      ON pdm.product_id = wm.product_id
     AND pdm.lot_id = wm.batch_id
     AND pdm.wafer_id = CAST(wm.wafer_id AS TEXT)
    LEFT JOIN substrate_defect sd
      ON sd.sub_id = pdm.sub_id
    LEFT JOIN oem_product_map opm
      ON opm.product_id = wm.product_id

    -- NEW: join file_index for both files we display
    LEFT JOIN file_index fi_sd
      ON fi_sd.file_path = sd.file_path
    LEFT JOIN file_index fi_map
      ON fi_map.file_path = wm.file_path

    ${where}
    ORDER BY ${sortCol} ${state.sortDir}
    LIMIT ? OFFSET ?
  `;
    const pageParams = [...params, state.pageSize, (state.page - 1) * state.pageSize];
    return db.select<Row[]>(sql, pageParams);
}

function fmtTime(ms: number | null) {
    if (!ms) return "—";
    const d = new Date(Number(ms));
    return Number.isNaN(d.getTime()) ? String(ms) : d.toLocaleString();
}

export default function WaferDataWindow() {
    // at top-level of the component
    const MIN_SKELETON_MS = 350;   // minimum time to show skeleton
    const FADE_OUT_MS = 150;       // small fade when switching to data

    const [state, setState] = useState<TableState>({ ...DEFAULT_STATE });
    const [debouncedQ] = useDebouncedValue(state.q, 250);
    const effective = useMemo(() => ({ ...state, q: debouncedQ }), [state, debouncedQ]);

    const [rows, setRows] = useState<Row[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [stages, setStages] = useState<string[]>([]);
    const [showSkeleton, setShowSkeleton] = useState(false); // visual loading
    const [reqId, setReqId] = useState(0);               // prevent race

    useEffect(() => {
        fetchStages().then(setStages).catch(() => setStages([]));
    }, []);

    const refresh = async () => {
        const id = reqId + 1;
        setReqId(id);

        setLoading(true);
        setShowSkeleton(true);                // start showing skeleton immediately
        const start = performance.now();

        try {
            const [count, data] = await Promise.all([queryCount(effective), queryRows(effective)]);
            const elapsed = performance.now() - start;
            const wait = Math.max(0, MIN_SKELETON_MS - elapsed);

            // wait so skeleton holds at least MIN_SKELETON_MS
            await new Promise((r) => setTimeout(r, wait));

            // if another refresh started, ignore this result
            if (id !== reqId + 1 && id !== reqId) return;

            setTotal(count);
            setRows(data);
        } finally {
            setLoading(false);
            // let the skeleton fade out a touch for smoothness
            setTimeout(() => setShowSkeleton(false), FADE_OUT_MS);
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effective.page, effective.pageSize, effective.sortBy, effective.sortDir, effective.q, effective.stage]);

    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));

    const exportCsv = () => {
        const header = [
            "product_id",
            "oem_product_id",
            "has_oem_map",     // NEW
            "batch_id",
            "wafer_id",
            "sub_id",
            "stage",
            "sub_stage",
            "retest_count",
            "time",
            "defect_path",
            "defect_mtime",    // NEW
            "defect_hash",     // NEW
            "map_path",
            "map_mtime",       // NEW
            "map_hash",        // NEW
            "pdm_path",        // NEW
        ].join(",");
        const body = rows.map(r =>
            [
                r.product_id,
                r.oem_product_id ?? "",
                r.has_oem_map, // NEW
                r.batch_id,
                r.wafer_id,
                r.sub_id ?? "",
                r.stage ?? "",
                r.sub_stage ?? "",
                r.retest_count ?? "",
                r.time ?? "",
                r.defect_path ?? "",
                r.defect_mtime ?? "", // NEW
                r.defect_hash ?? "",  // NEW
                r.map_path ?? "",
                r.map_mtime ?? "",    // NEW
                r.map_hash ?? "",     // NEW
                r.pdm_path ?? "",     // NEW
            ]
                .map(v => (String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
                .join(",")
        );
        const csv = [header, ...body].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "wafer_data_page.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    // ---- 骨架行渲染 ----
    const renderSkeletonRows = (count: number) =>
        Array.from({ length: count }).map((_, i) => (
            <tr key={`skeleton-${i}`}>
                {Array.from({ length: 16 }).map((__, j) => ( // NEW: skeleton cells = new column count
                    <td key={`sk-${i}-${j}`} style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                        <Skeleton height={14} width={`${50 + (j % 5) * 10}%`} radius="sm" />
                    </td>
                ))}
            </tr>
        ));

    const placeholderCount = Math.min(state.pageSize, 5); // 避免一次渲染过多骨架行

    return (
        <Stack p="md" gap="sm">
            <Group justify="space-between" align="center">
                <div>
                    <Title order={3}>晶圆数据</Title>
                    <Text c="dimmed" size="sm">来自各个子目录数据的联合视图</Text>
                </div>

                <Group gap="xs">
                    {loading ?
                        (<Skeleton height={22} width={120} radius="sm" />)
                        : (<Badge variant="light">{total.toLocaleString()} 条记录</Badge>)
                    }

                    {loading ? (
                        <Skeleton height={28} width={86} radius="sm" />
                    ) : (
                        <Tooltip label="导出当前页为 CSV">
                            <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={exportCsv}>导出</Button>
                        </Tooltip>
                    )}

                    <Tooltip label="刷新">
                        <ActionIcon variant="light" aria-label="刷新" onClick={refresh} disabled={loading}>
                            {loading ? <Skeleton height={16} width={16} radius="xl" /> : <IconRefresh size={16} />}
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>

            {/* 工具栏 */}
            <Group gap="sm" wrap="wrap">
                <TextInput
                    size="sm"
                    style={{ minWidth: 260 }}
                    leftSection={<IconSearch size={14} />}
                    placeholder="搜索 产品/批次/晶圆/SubID/路径/OEM…"
                    value={state.q}
                    onChange={(e) => setState((s) => ({ ...s, page: 1, q: e.currentTarget.value }))}
                    rightSection={
                        state.q ? (
                            <ActionIcon
                                size="sm"
                                variant="subtle"
                                onClick={() => setState((s) => ({ ...s, page: 1, q: "" }))}
                                disabled={loading}
                            >
                                <IconX size={14} />
                            </ActionIcon>
                        ) : undefined
                    }
                    disabled={loading}
                />

                <Select
                    size="sm"
                    style={{ width: 160 }}
                    placeholder="全部工序"
                    value={state.stage}
                    onChange={(v) => setState((s) => ({ ...s, page: 1, stage: v }))}
                    data={stages.map((st) => ({ value: String(st), label: st }))}
                    clearable
                    disabled={loading}
                />

                <Select
                    size="sm"
                    style={{ width: 160 }}
                    value={state.sortBy}
                    onChange={(v) => setState((s) => ({ ...s, sortBy: (v as SortKey) || s.sortBy }))}
                    data={[
                        { value: "time", label: "时间" },
                        { value: "product", label: "产品" },
                        { value: "batch", label: "批次/Lot" },
                        { value: "wafer", label: "晶圆" },
                        { value: "stage", label: "工序" },
                    ]}
                    allowDeselect={false}
                    disabled={loading}
                />

                <Tooltip label={`按${state.sortDir === "ASC" ? "升序" : "降序"}排序`}>
                    <ActionIcon
                        size="sm"
                        variant="default"
                        onClick={() => setState((s) => ({ ...s, sortDir: s.sortDir === "ASC" ? "DESC" : "ASC" }))}
                        disabled={loading}
                    >
                        <IconArrowsSort size={16} />
                    </ActionIcon>
                </Tooltip>

                <Select
                    size="sm"
                    style={{ width: 120 }}
                    value={String(state.pageSize)}
                    onChange={(v) => setState((s) => ({ ...s, page: 1, pageSize: Number(v) || s.pageSize }))}
                    data={["25", "50", "100", "200"].map((v) => ({ value: v, label: `${v} 条/页` }))}
                    allowDeselect={false}
                    disabled={loading}
                />
            </Group>

            <Divider />

            {/* 表格 */}
            <Box style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, overflow: "hidden" }}>
                <Box component="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "var(--mantine-color-gray-0)" }}>
                            <th style={{ textAlign: "left", padding: 8, width: 150 }}>产品</th>
                            <th style={{ textAlign: "left", padding: 8, width: 150 }}>OEM 产品</th>
                            <th style={{ textAlign: "left", padding: 8, width: 90 }}>OEM 映射</th> {/* NEW */}
                            <th style={{ textAlign: "left", padding: 8, width: 140 }}>批次/Lot</th>
                            <th style={{ textAlign: "left", padding: 8, width: 80 }}>晶圆</th>
                            <th style={{ textAlign: "left", padding: 8, width: 110 }}>工序</th>
                            <th style={{ textAlign: "left", padding: 8, width: 120 }}>子工序</th>
                            <th style={{ textAlign: "left", padding: 8, width: 110 }}>复测次数</th>
                            <th style={{ textAlign: "left", padding: 8, width: 180 }}>时间</th>

                            <th style={{ textAlign: "left", padding: 8 }}>缺陷文件</th>
                            <th style={{ textAlign: "left", padding: 8, width: 160 }}>缺陷mtime</th> {/* NEW */}
                            <th style={{ textAlign: "left", padding: 8, width: 160 }}>缺陷hash</th> {/* NEW */}

                            <th style={{ textAlign: "left", padding: 8 }}>晶圆图文件</th>
                            <th style={{ textAlign: "left", padding: 8, width: 160 }}>图mtime</th> {/* NEW */}
                            <th style={{ textAlign: "left", padding: 8, width: 160 }}>图hash</th>   {/* NEW */}

                            <th style={{ textAlign: "left", padding: 8, width: 140 }}>SubID</th>
                            <th style={{ textAlign: "left", padding: 8 }}>PDM 来源</th> {/* NEW */}
                        </tr>
                    </thead>
                    <tbody>
                        {showSkeleton
                            ? renderSkeletonRows(placeholderCount)
                            : rows.map((r, i) => (
                                <tr key={`${r.product_id}-${r.batch_id}-${r.wafer_id}-${i}`}>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        <code style={{ fontSize: 12 }}>{r.product_id}</code>
                                    </td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        <code style={{ fontSize: 12 }}>{r.oem_product_id ?? ""}</code>
                                    </td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        {/* NEW: has_oem_map as badge */}
                                        {r.has_oem_map ? (
                                            <Badge size="xs" color="green" variant="light">已映射</Badge>
                                        ) : (
                                            <Badge size="xs" color="gray" variant="outline">未映射</Badge>
                                        )}
                                    </td>

                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        <code style={{ fontSize: 12 }}>{r.batch_id}</code>
                                    </td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>{r.wafer_id}</td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>{r.stage ?? "—"}</td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>{r.sub_stage ?? "—"}</td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>{r.retest_count ?? 0}</td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>{fmtTime(r.time)}</td>

                                    {/* Substrate defect file & metadata */}
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        <code style={{ fontSize: 12 }}>{r.defect_path ?? ""}</code>
                                    </td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        {fmtTime(r.defect_mtime)}
                                    </td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        <code style={{ fontSize: 12 }}>{r.defect_hash ?? ""}</code>
                                    </td>

                                    {/* Wafer map file & metadata */}
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        <code style={{ fontSize: 12 }}>{r.map_path ?? ""}</code>
                                    </td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        {fmtTime(r.map_mtime)}
                                    </td>
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        <code style={{ fontSize: 12 }}>{r.map_hash ?? ""}</code>
                                    </td>

                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        <code style={{ fontSize: 12 }}>{r.sub_id ?? ""}</code>
                                    </td>

                                    {/* PDM source path */}
                                    <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                        <code style={{ fontSize: 12 }}>{r.pdm_path ?? ""}</code>
                                    </td>
                                </tr>
                            ))}

                        {!showSkeleton && rows.length === 0 && (
                            <tr>
                                <td colSpan={16} style={{ padding: 12, textAlign: "center", color: "var(--mantine-color-dimmed)" }}>
                                    无结果
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Box>
            </Box>

            <Group justify="flex-end">
                <Pagination
                    value={state.page}
                    onChange={(p) => setState((s) => ({ ...s, page: p }))}
                    total={totalPages}
                    withControls
                    boundaries={1}
                    siblings={1}
                    disabled={loading}
                />
            </Group>
        </Stack>
    );
}
