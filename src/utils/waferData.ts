// import { invokeParseProductMappingXls } from '@/api/tauri/wafer';
// import { ExcelType, isExcelMetadata, isWaferFileMetadata, ProductMappingXlsResult, RawWaferMetadataCollection } from '@/types/Wafer';

// export async function processMetadataList(rawData: RawWaferMetadataCollection) {
//     for (const raw of rawData) {
//         if (isExcelMetadata(raw)) {
//             const { filePath, type } = raw;
//             switch (type) {
//                 case ExcelType.Mapping:

//                     break;
//                 case ExcelType.Product:
//                     break;
//                 case ExcelType.DefectList:
//                     break;
//                 default:
//                     break;
//             }
//             const excelResult = await Excel
//         } else if (isWaferFileMetadata(raw)) {

//         }
//     }
// }

// async function handleMapping(path: string): Promise<ProductMappingXlsResult | null> {
//     try {
//         const excelResult = await invokeParseProductMappingXls(path);
//         return excelResult;
//     } catch (err: unknown) {
//         const message = err instanceof Error ? err.message : String(err);
//         return null;
//     }
// }

// async function handleProduct() {

// }

// async function handleDefectList() {

// }

// readers/pattern.ts

import { listDirs, listFiles, join, mtimeMs, match } from './fs';

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
) {
    const out: Array<{ ctx: T; filePath: string; lastModified: number }> = [];

    async function walk(level: number, parentPath: string, ctx: T) {
        if (level === pattern.steps.length) {
            // terminal: list files
            for (const f of await listFiles(parentPath, pattern.files.name)) {
                const m = match(pattern.files.name, f.name);
                if (!m) continue;
                const [, ...g] = m;
                const filePath = await join(parentPath, f.name);
                pattern.files.onFile(ctx, filePath, await mtimeMs(filePath));
            }
            return;
        }

        const step = pattern.steps[level];
        for (const d of await listDirs(parentPath, step.name)) {
            const m = match(step.name, d.name)!;
            const [, ...g] = m;
            if (step.onMatch && step.onMatch(g) === false) continue;
            const nextCtx = { ...ctx, ...contextFromFolder(level, d.name, g) } as T;
            await walk(level + 1, await join(parentPath, d.name), nextCtx);
        }
    }

    // collect via files.onFile
    const items: Array<{ ctx: T; filePath: string; lastModified: number }> = [];
    const push = (ctx: T, filePath: string, lastModified: number) => items.push({ ctx, filePath, lastModified });

    // replace onFile at runtime so we can capture 'items'
    const originalOnFile = pattern.files.onFile;
    pattern.files.onFile = (ctx, p, m) => { push(ctx as T, p, m); originalOnFile(ctx, p, m); };

    for (const r of roots) await walk(0, r, {} as T);
    pattern.files.onFile = originalOnFile;
    return items;
}