import { basename } from '@tauri-apps/api/path';
import { listDirs, listFiles, join, mtimeMs, match } from './fs';
import { logCacheReport } from './console';

type FolderStep = {
    name: RegExp;                       // regex to select child dirs
    onMatch?: (groups: string[]) => void | boolean; // return false to skip this branch
};

type FileStep = {
    name: RegExp;                       // regex to select files
    onFile: (ctx: Record<string, string>, absPath: string, lastModified: number) => void;
};

type Pattern = {
    steps: FolderStep[];                // ordered folder levels
    files: FileStep;                    // terminal file rule
};

export async function scanPattern<T extends Record<string, string>>(
    roots: string[],
    pattern: Pattern,
    contextFromFolder: (level: number, folderName: string, groups: string[]) => Partial<T>
): Promise<{
    data: { ctx: T; filePath: string; lastModified: number }[];
    totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number; elapsed: number;
    readDirs: string[]; cachedDirs: string[];
}> {
    let totDir = 0, numRead = 0, numCached = 0, totMatch = 0, totAdded = 0, elapsed = 0;

    // track both folders and files
    const readDirs: string[] = [];
    const cachedDirs: string[] = [];
    const readFiles: string[] = [];
    const cachedFiles: string[] = [];

    async function walk(level: number, parentPath: string, ctx: T) {
        if (level === pattern.steps.length) {
            // terminal: files
            const t0 = performance.now();
            const { files, cached, totDir: totFiles, numCached: numCachedFile, numRead: numReadFile } =
                await listFiles({ root: parentPath, name: pattern.files.name });
            elapsed += performance.now() - t0;

            totDir += totFiles; numRead += numReadFile; numCached += numCachedFile;

            for (const f of files) {
                const m = match(pattern.files.name, f); if (!m) continue;
                totMatch++;
                totAdded++;
                const filePath = await join(parentPath, f);
                readFiles.push(filePath);
                pattern.files.onFile(ctx, filePath, await mtimeMs(filePath));
            }
            for (const cache of cached) {
                const filepath = cache.file_path;
                const filename = await basename(filepath);
                const m = match(pattern.files.name, filename); if (!m) continue;
                cachedFiles.push(filepath);
                pattern.files.onFile(ctx, filepath, await mtimeMs(filepath));
            }
            return;
        }

        // descend into next-level folders
        const step = pattern.steps[level];
        const t1 = performance.now();
        const { folders: dirs, cached, totDir: totFolders, numCached: numCachedFolder, numRead: numReadFolder } =
            await listDirs({ root: parentPath, name: step.name });
        elapsed += performance.now() - t1;

        totDir += totFolders; numRead += numReadFolder; numCached += numCachedFolder;

        for (const d of dirs) {
            const m = match(step.name, d)!; const [, ...g] = m;
            if (step.onMatch && step.onMatch(g) === false) continue;
            totMatch++;
            totAdded++;
            const nextCtx = { ...ctx, ...contextFromFolder(level, d, g) } as T;
            const nextPath = await join(parentPath, d);
            readDirs.push(nextPath);
            await walk(level + 1, nextPath, nextCtx);
        }

        for (const d of cached as any[]) {
            const folderPath: string = typeof d === 'string' ? await join(parentPath, d) : d.folder_path;
            const folderName = await basename(folderPath);
            const m = match(step.name, folderName)!; const [, ...g] = m;
            if (step.onMatch && step.onMatch(g) === false) continue;
            const nextCtx = { ...ctx, ...contextFromFolder(level, folderName, g) } as T;
            cachedDirs.push(folderPath);
            await walk(level + 1, await join(parentPath, folderName), nextCtx);
        }
    }

    // collect via files.onFile
    const items: Array<{ ctx: T; filePath: string; lastModified: number }> = [];
    const push = (ctx: T, filePath: string, lastModified: number) => items.push({ ctx, filePath, lastModified });

    const originalOnFile = pattern.files.onFile;
    pattern.files.onFile = (ctx, p, m) => { push(ctx as T, p, m); originalOnFile(ctx, p, m); };

    for (const r of roots) await walk(0, r, {} as T);
    pattern.files.onFile = originalOnFile;

    // dirs should include files + folders (read + cached)
    const considered = [...readDirs, ...cachedDirs, ...readFiles, ...cachedFiles];

    logCacheReport({
        dirs: considered.length ? considered : 0,
        totDir,
        numCached,
        numRead,
        label: 'scanPattern',
        durationMs: elapsed,
    });

    return {
        data: items,
        totDir,
        numRead,
        numCached,
        totMatch,
        totAdded,
        elapsed,
        readDirs,
        cachedDirs,
    };
}
