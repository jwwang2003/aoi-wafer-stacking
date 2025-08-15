import { toast, ToastOptions } from 'react-toastify';

const globalStyles = {
    minHeight: 'auto',
    padding: '10px 12px',
    border: '1px solid #000',
    boxShadow: '0 8px 22px rgba(0,0,0,0.28)'
};

const defaultOptions = {
    hideProgressBar: true,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: false,
};

// Make titles stand out more
const titleStyle: React.CSSProperties = {
    fontWeight: 800,
    fontSize: '0.98rem',
    letterSpacing: '0.2px',
    color: '#000',
    marginBottom: 8,
    padding: '0 0 4px 8px',
    borderLeft: '3px solid #000',
};

export type InfoLine = {
    label?: string;
    value: string | number;
    color?: string;
};

export interface InfoToastPayload {
    title?: string;                 // e.g. "提示" / "Info"
    message?: string | React.ReactNode;
    lines?: InfoLine[];             // show key-value lines (renders 2 columns when >= 2 lines)
    theme?: 'light' | 'dark';
    width?: number;                 // override width
}

/** Lightweight item row */
function InfoRow({ label, value, color }: InfoLine) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {label ? <span style={{ opacity: 0.8 }}>{label}</span> : <span />}
            <span style={{ fontWeight: 700, color }}>{typeof value === 'number' ? new Intl.NumberFormat('zh-CN').format(value) : value}</span>
        </div>
    );
}

/** Content renderer for the info toast */
function InfoToastContent({ payload }: { payload: InfoToastPayload }) {
    const { title, message, lines } = payload;
    const useGrid = Array.isArray(lines) && lines.length > 1;

    return (
        <div style={{ lineHeight: 1.2, width: '100%' }}>
            {title && <div style={titleStyle}>{title}</div>}
            {message && <div style={{ marginBottom: lines?.length ? 8 : 0 }}>{message}</div>}
            {Array.isArray(lines) && lines.length > 0 && (
                <div
                    style={{
                        display: useGrid ? 'grid' : 'block',
                        gridTemplateColumns: useGrid ? '1fr 1fr' : undefined,
                        gap: 8,
                    }}
                >
                    {lines.map((ln, i) => (
                        <InfoRow key={i} {...ln} />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Show a compact info toast with optional title, message, and key-value lines.
 *
 * Usage:
 *   infoToast({ title: "提示", message: "已保存设置" });
 *   infoToast({ title: "扫描信息", lines: [
 *     { label: "总文件夹", value: 12 },
 *     { label: "命中缓存", value: 9, color: "#228be6" },
 *   ]});
 */
export function infoToast(payload: InfoToastPayload, options?: ToastOptions) {
    const width =
        payload.width ??
        (payload.lines && payload.lines.length > 1 ? 300 : 'default'); // slightly wider for 2-column

    toast(<InfoToastContent payload={payload} />, {
        theme: payload.theme ?? 'light',
        ...defaultOptions,
        style: {
            ...globalStyles,
            width,
            // maxWidth: Math.max(width, 220),
            borderRadius: 8,
        },
        ...options,
    });
}

export type DirScanResultStats = {
    totDirs: number;
    numRead: number;
    numCached: number;
    totMatch: number;
    totAdded: number;
};

const nf = new Intl.NumberFormat('zh-CN');

function StatItem({
    label,
    value,
    color,
}: {
    label: string;
    value: number | string;
    color?: string;
}) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ opacity: 0.8 }}>{label}</span>
            <span style={{ fontWeight: 700, color }}>{typeof value === 'number' ? nf.format(value) : value}</span>
        </div>
    );
}

function SubfolderScanResultToastContent({
    routineName,
    stats,
    durationMs,
}: {
    routineName: string,
    stats: DirScanResultStats;
    durationMs: number;
}) {
    const { totDirs: totFolders, numRead, numCached, totMatch, totAdded } = stats;
    const ms = Math.max(0, Math.round(durationMs));

    return (
        <div style={{ lineHeight: 1.2, width: '100%' }}>
            <div style={titleStyle}>{`任务${routineName}完成`}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <StatItem label="总文DIR" value={totFolders} />
                <StatItem label="耗时" value={`${nf.format(ms)} ms`} />
                <StatItem label="新/更" value={numRead} color="#37b24d" />
                <StatItem label="缓存" value={numCached} color="#228be6" />
                <StatItem label="匹配" value={totMatch} color="#7458f6" />
                <StatItem label="新增" value={totAdded} color="#f59f00" />
            </div>
        </div>
    );
}

/** Display a compact, two-column toast summarizing a subfolder scan result. */
export function dirScanResultToast(
    stats: DirScanResultStats,
    durationMs: number = 3000,          // default duration of 3s
    routineName: string = '',
    options?: ToastOptions
) {
    toast(<SubfolderScanResultToastContent stats={stats} durationMs={durationMs} routineName={routineName} />, {
        theme: 'light',
        ...defaultOptions,
        // compact + black border + drop shadow
        style: {
            ...globalStyles,
            width: 280,
            maxWidth: 300,
        },
        ...options,
    });
}
