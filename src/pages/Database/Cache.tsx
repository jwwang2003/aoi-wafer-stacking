import { useEffect, useMemo, useState } from "react";
import {
    Box,
    Group,
    Stack,
    Text,
    Title,
    Tabs,
    TextInput,
    Select,
    Pagination,
    ActionIcon,
    Tooltip,
    Loader,
    Badge,
    Divider,
    Button,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconArrowsSort, IconRefresh, IconSearch, IconX, IconTrash } from "@tabler/icons-react";
import { getDb } from "@/db";
import type { FileIndexRow, FolderIndexRow } from "@/db/types";
import { deleteAllFileIndexes } from "@/db/fileIndex";
import { deleteAllFolderIndexes } from "@/db/folderIndex";

/**
 * 缓存查看页（Database Viewer）
 * - 以服务端分页方式显示 folder_index / file_index 的缓存记录
 * - 支持快速搜索（LIKE）与排序（path / mtime / hash）
 * - 避免 getAll* 全量读取，使用 LIMIT/OFFSET
 */

type TableKind = "files" | "folders";

// ---- 通用表格状态 ----
interface TableState {
    page: number;
    pageSize: number;
    sortBy: string; // 与 SORT_OPTIONS_* 的 key 对应
    sortDir: "ASC" | "DESC";
    query: string; // 搜索关键字
}

const DEFAULT_STATE: TableState = {
    page: 1,
    pageSize: 50,
    sortBy: "path",
    sortDir: "ASC",
    query: "",
};

// ---- 排序选项（key -> {label, col}）----
const SORT_OPTIONS_FILES = {
    path: { label: "文件路径", col: "file_path" },
    mtime: { label: "最后修改时间", col: "last_mtime" },
    hash: { label: "文件哈希", col: "file_hash" },
} as const;

const SORT_OPTIONS_FOLDERS = {
    path: { label: "文件夹路径", col: "folder_path" },
    mtime: { label: "最后修改时间", col: "last_mtime" },
} as const;

type FileSortKey = keyof typeof SORT_OPTIONS_FILES;
type FolderSortKey = keyof typeof SORT_OPTIONS_FOLDERS;

// ---- 辅助方法 ----
function fmtTime(ms: number | null | undefined) {
    if (!ms) return "—";
    try {
        const d = new Date(Number(ms));
        if (Number.isNaN(d.getTime())) return String(ms);
        return d.toLocaleString();
    } catch {
        return String(ms);
    }
}

// ---- 缓存清理 ----
async function clearFileCache() {
    await deleteAllFileIndexes();
    // TODO: Clear local cache
}

async function clearFolderCache() {
    await deleteAllFolderIndexes();
    // TODO: Clear local cache
}

async function clearAllCaches() {
    const db = await getDb();
    await db.execute(`DELETE FROM file_index`);
    await db.execute(`DELETE FROM folder_index`);
}

//==============================================================================
// NOTE: SQL Section
//==============================================================================

async function queryFiles(
    { page, pageSize, sortBy, sortDir, query }: TableState
): Promise<{ rows: FileIndexRow[]; total: number }> {
    const db = await getDb();
    const sortCol = SORT_OPTIONS_FILES[(sortBy as FileSortKey) || "path"].col;
    const where = query ? `WHERE file_path LIKE ? OR IFNULL(file_hash,'') LIKE ?` : "";
    const params: any[] = query ? [`%${query}%`, `%${query}%`] : [];

    const [{ total }] = await db.select<{ total: number }[]>(
        `SELECT COUNT(*) as total FROM file_index ${where}`,
        params
    );

    const rows = await db.select<FileIndexRow[]>(
        `SELECT file_path, last_mtime, file_hash
    FROM file_index
    ${where}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
    );
    return { rows, total };
}

async function queryFolders(
    { page, pageSize, sortBy, sortDir, query }: TableState
): Promise<{ rows: FolderIndexRow[]; total: number }> {
    const db = await getDb();
    const sortCol = SORT_OPTIONS_FOLDERS[(sortBy as FolderSortKey) || "path"].col;
    const where = query ? `WHERE folder_path LIKE ?` : "";
    const params: any[] = query ? [`%${query}%`] : [];

    const [{ total }] = await db.select<{ total: number }[]>(
        `SELECT COUNT(*) as total FROM folder_index ${where}`,
        params
    );

    const rows = await db.select<FolderIndexRow[]>(
        `SELECT folder_path, last_mtime
    FROM folder_index
    ${where}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
    );
    return { rows, total };
}

//==============================================================================

interface ToolbarProps {
    kind: TableKind;
    state: TableState;
    onChange: (patch: Partial<TableState>) => void;
    total: number | null;
    loading: boolean;
    onRefresh: () => void;
    onClear?: () => Promise<void>;
    clearLoading?: boolean;
}

function Toolbar({ kind, state, onChange, total, loading, onRefresh, onClear, clearLoading }: ToolbarProps) {
    const sortOptions = kind === "files" ? SORT_OPTIONS_FILES : SORT_OPTIONS_FOLDERS;
    const sortSelectData = Object.entries(sortOptions).map(([value, v]) => ({ value, label: v.label }));

    return (
        <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="sm" wrap="wrap">
                <TextInput
                    size="sm"
                    leftSection={<IconSearch size={14} />}
                    placeholder={kind === "files" ? "搜索：路径/哈希…" : "搜索：文件夹路径…"}
                    value={state.query}
                    onChange={(e) => onChange({ page: 1, query: e.currentTarget.value })}
                    rightSection={state.query ? (
                        <ActionIcon size="sm" variant="subtle" onClick={() => onChange({ page: 1, query: "" })}>
                            <IconX size={14} />
                        </ActionIcon>
                    ) : undefined}
                />
                <Select
                    size="sm"
                    value={state.sortBy}
                    onChange={(v) => onChange({ sortBy: (v as string) || state.sortBy })}
                    data={sortSelectData}
                    allowDeselect={false}
                    placeholder="排序字段"
                />
                <Tooltip label={`切换为${state.sortDir === "ASC" ? "降序" : "升序"}`}>
                    <ActionIcon
                        size="sm"
                        variant="default"
                        onClick={() => onChange({ sortDir: state.sortDir === "ASC" ? "DESC" : "ASC" })}
                        aria-label="切换排序方向"
                    >
                        <IconArrowsSort size={16} />
                    </ActionIcon>
                </Tooltip>
                <Select
                    size="sm"
                    value={String(state.pageSize)}
                    onChange={(v) => onChange({ page: 1, pageSize: Number(v) || state.pageSize })}
                    data={["25", "50", "100", "200"].map((v) => ({ value: v, label: `${v}/页` }))}
                    allowDeselect={false}
                    placeholder="每页数量"
                />
            </Group>
            <Group gap="xs">
                {typeof total === "number" && (
                    <Badge variant="light" radius="sm">
                        {total.toLocaleString()} 条
                    </Badge>
                )}

                {/* 子页清理按钮 */}
                {onClear && (
                    <Tooltip label={`清空${kind === "files" ? "文件" : "文件夹"}缓存`}>
                        <Button
                            size="xs"
                            color="red"
                            variant="light"
                            leftSection={<IconTrash size={14} />}
                            loading={!!clearLoading}
                            onClick={async () => {
                                await onClear();
                            }}
                        >
                            清空缓存
                        </Button>
                    </Tooltip>
                )}

                <ActionIcon onClick={onRefresh} variant="light" size="md" aria-label="刷新">
                    {loading ? <Loader size="sm" /> : <IconRefresh size={16} />}
                </ActionIcon>
            </Group>
        </Group>
    );
}

function FilesTable({ refreshToken }: { refreshToken: number }) {
    const [state, setState] = useState<TableState>({ ...DEFAULT_STATE });
    const [debouncedQuery] = useDebouncedValue(state.query, 250);
    const effectiveState = useMemo(() => ({ ...state, query: debouncedQuery }), [state, debouncedQuery]);

    const [rows, setRows] = useState<FileIndexRow[]>([]);
    const [total, setTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [clearLoading, setClearLoading] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            const { rows, total } = await queryFiles(effectiveState);
            setRows(rows);
            setTotal(total);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveState.page, effectiveState.pageSize, effectiveState.sortBy, effectiveState.sortDir, effectiveState.query, refreshToken]);

    const totalPages = total ? Math.max(1, Math.ceil(total / state.pageSize)) : 1;

    const handleClear = async () => {
        setClearLoading(true);
        try {
            if (!await window.confirm("确认清空文件的缓存记录？该操作不可撤销。")) return;
            await clearFileCache();
            await refresh();
        } finally {
            setClearLoading(false);
        }
    };

    return (
        <Stack gap="xs">
            <Toolbar
                kind="files"
                state={state}
                onChange={(p) => setState((s) => ({ ...s, ...p }))}
                total={total}
                loading={loading}
                onRefresh={refresh}
                onClear={handleClear}
                clearLoading={clearLoading}
            />
            <Box style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, overflow: "hidden" }}>
                <Box component="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "var(--mantine-color-gray-0)" }}>
                            <th style={{ textAlign: "left", padding: 8 }}>文件路径</th>
                            <th style={{ textAlign: "left", padding: 8, width: 220 }}>最后修改时间</th>
                            <th style={{ textAlign: "left", padding: 8, width: 220 }}>文件哈希</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.file_path}>
                                <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                    <code style={{ fontSize: 12 }}>{r.file_path}</code>
                                </td>
                                <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>{fmtTime(r.last_mtime)}</td>
                                <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                    <code style={{ fontSize: 12 }}>{r.file_hash ?? ""}</code>
                                </td>
                            </tr>
                        ))}
                        {!rows.length && (
                            <tr>
                                <td colSpan={3} style={{ padding: 12, textAlign: "center", color: "var(--mantine-color-dimmed)" }}>
                                    {loading ? "加载中…" : "暂无数据"}
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
                />
            </Group>
        </Stack>
    );
}

function FoldersTable({ refreshToken }: { refreshToken: number }) {
    const [state, setState] = useState<TableState>({ ...DEFAULT_STATE });
    const [debouncedQuery] = useDebouncedValue(state.query, 250);
    const effectiveState = useMemo(() => ({ ...state, query: debouncedQuery }), [state, debouncedQuery]);

    const [rows, setRows] = useState<FolderIndexRow[]>([]);
    const [total, setTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [clearLoading, setClearLoading] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            const { rows, total } = await queryFolders(effectiveState);
            setRows(rows);
            setTotal(total);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveState.page, effectiveState.pageSize, effectiveState.sortBy, effectiveState.sortDir, effectiveState.query, refreshToken]);

    const totalPages = total ? Math.max(1, Math.ceil(total / state.pageSize)) : 1;

    const handleClear = async () => {
        setClearLoading(true);
        try {
            if (!await window.confirm("确认清空文件夹的缓存记录？该操作不可撤销。")) return;
            await clearFolderCache();
            await refresh();
        } finally {
            setClearLoading(false);
        }
    };

    return (
        <Stack gap="xs">
            <Toolbar
                kind="folders"
                state={state}
                onChange={(p) => setState((s) => ({ ...s, ...p }))}
                total={total}
                loading={loading}
                onRefresh={refresh}
                onClear={handleClear}
                clearLoading={clearLoading}
            />
            <Box style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, overflow: "hidden" }}>
                <Box component="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "var(--mantine-color-gray-0)" }}>
                            <th style={{ textAlign: "left", padding: 8 }}>路径</th>
                            <th style={{ textAlign: "left", padding: 8, width: 220 }}>最后修改时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.folder_path}>
                                <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>
                                    <code style={{ fontSize: 12 }}>{r.folder_path}</code>
                                </td>
                                <td style={{ padding: 8, borderTop: "1px solid var(--mantine-color-gray-3)" }}>{fmtTime(r.last_mtime)}</td>
                            </tr>
                        ))}
                        {!rows.length && (
                            <tr>
                                <td colSpan={2} style={{ padding: 12, textAlign: "center", color: "var(--mantine-color-dimmed)" }}>
                                    {loading ? "加载中…" : "暂无数据"}
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
                />
            </Group>
        </Stack>
    );
}

export default function DatabaseViewerPage() {
    const [refreshToken, setRefreshToken] = useState(0);

    const handleClearAll = async () => {
        if (!await window.confirm("确认清空的全部缓存记录？该操作不可撤销。")) return;
        await clearAllCaches();
        setRefreshToken((x) => x + 1);
    };

    return (
        <Stack p="md" gap="sm">
            <Group justify="space-between" align="center">
                <div>
                    <Title order={3}>缓存记录</Title>
                    <Text c="dimmed" size="sm">
                        查看文件和文件夹的缓存记录
                    </Text>
                </div>

                {/* 顶部：清空全部 */}
                <Tooltip label="同时清空文件与文件夹缓存">
                    <Button
                        color="red"
                        variant="light"
                        leftSection={<IconTrash size={16} />}
                        onClick={handleClearAll}
                    >
                        清空全部缓存
                    </Button>
                </Tooltip>
            </Group>

            <Divider my="xs" />
            <Tabs defaultValue="files" keepMounted={false}>
                <Tabs.List>
                    <Tabs.Tab value="files">文件缓存</Tabs.Tab>
                    <Tabs.Tab value="folders">文件夹缓存</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="files" pt="xs">
                    <FilesTable refreshToken={refreshToken} />
                </Tabs.Panel>
                <Tabs.Panel value="folders" pt="xs">
                    <FoldersTable refreshToken={refreshToken} />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
}
