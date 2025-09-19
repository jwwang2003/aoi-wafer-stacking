type CacheReportIn = {
    dirs: number | string[];   // count or a list
    totDir?: number;           // optional: total candidates discovered
    numCached: number;         // cache hits (skipped)
    numRead: number;           // actually read (misses)
    label?: string;            // e.g. "WLBI", "CP-prober"
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

    const headerLeft = `📦 ${label}`;
    const headerRight =
        `considered: ${fmtN(considered)} | processed: ${fmtN(processed)} | ` +
        `hits: ${fmtN(numCached)} (${fmtP(hitRate)}) | misses: ${fmtN(numRead)} (${fmtP(missRate)})` +
        (durationMs != null ? ` | ⏱ ${fmtN(Math.round(durationMs))} ms` : '');

    // Pretty, single-line info with subtle color accents
    console.info(
        `%c${headerLeft}%c  ${headerRight}`,
        'color:#2563eb; font-weight:600', // blue label
        'color:#334155' // slate details
    );

    if (Array.isArray(dirs) && dirs.length) {
        const max = 10;
        const sample = dirs.slice(0, max);
        const more = dirs.length - sample.length;
        console.debug(
            `%c  sample%c ${fmtN(sample.length)}${more > 0 ? ` of ${fmtN(dirs.length)}` : ''}: %o %c${more > 0 ? `…(+${fmtN(more)} more)` : ''}`,
            'color:#64748b',
            'color:#0f766e',
            sample,
            'color:#64748b'
        );
    }
}
