type CacheReportIn = {
    dirs: number | string[];   // count or a list
    totDir?: number;           // optional: total candidates discovered
    numCached: number;         // cache hits (skipped)
    numRead: number;           // actually read (misses)
    label?: string;            // e.g. 'WLBI', 'CP-prober'
    durationMs?: number;       // optional timing
};

export function logCacheReport({
    dirs, totDir, numCached, numRead, label = 'cache', durationMs,
}: CacheReportIn) {
    const fmtN = (v: number) => new Intl.NumberFormat().format(v);
    const fmtP = (v: number) =>
        new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(v);

    const considered = totDir ?? (typeof dirs === 'number' ? dirs : dirs.length);
    const processed = (numCached ?? 0) + (numRead ?? 0);
    const hitRate = processed ? numCached / processed : 0;
    const missRate = processed ? numRead / processed : 0;

    const header =
        `📦 ${label}  |  considered: ${fmtN(considered)}  |  processed: ${fmtN(processed)}  |  ` +
        `hits: ${fmtN(numCached)} (${fmtP(hitRate)})  |  misses: ${fmtN(numRead)} (${fmtP(missRate)})` +
        (durationMs != null ? `  |  ⏱ ${fmtN(Math.round(durationMs))} ms` : '');

    console.groupCollapsed(header);

    console.table([{
        label,
        considered,
        processed,
        hits_cached: numCached,
        misses_read: numRead,
        hit_rate: fmtP(hitRate),
        miss_rate: fmtP(missRate),
        duration_ms: durationMs ?? null,
    }]);

    if (Array.isArray(dirs) && dirs.length) {
        const max = 10;
        const sample = dirs.slice(0, max);
        const more = dirs.length - sample.length;
        console.log(
            `Dirs sample (${fmtN(sample.length)}${more > 0 ? ` of ${fmtN(dirs.length)}` : ''}):`,
            sample,
            more > 0 ? `…(+${fmtN(more)} more)` : ''
        );
    }

    console.groupEnd();
}
