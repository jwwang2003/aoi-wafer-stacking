import * as IPC from './ipc';

export {
    IPC
};

// General state interfaces that is used during runtime by the program

import type { DataSourceType } from './dataSource';
import type { DirResult } from './ipc';

export const enum Direction {
    'Up',
    'Down',
    'Left',
    'Right'
}

export const enum DirectionAllCap {
    'UP',
    'DOWN',
    'LEFT',
    'RIGHT'
}

////////////////////////////////////////////////////////////////////////////////
// NOTE: Excel data
////////////////////////////////////////////////////////////////////////////////

export enum ExcelType {
    Mapping = 'productMapping',                 // Product list (e.g., from OEM or internal record)
    Product = 'productDefectMapping',           // Product metadata
    DefectList = 'substrateDefectList',         // Defect sheet
}

/**
 * Metadata and context for an Excel file.
 */
export interface ExcelMetadata {
    stage: DataSourceType;
    type: ExcelType;

    /** Optional extracted timestamp from filename or context (e.g., "20250709_120302") */
    id?: string;
    oem?: string;
    time?: string;      // timestamp from the filename

    /** Detailed file info from the filesystem */
    filePath: string;
    lastModified: number;
}

////////////////////////////////////////////////////////////////////////////////
// NOTE: Wafer Metadata
////////////////////////////////////////////////////////////////////////////////

/**
 * Metadata extracted from a wafer-related file path or filename.
 */
export interface WaferFileMetadata {
    // Required properties
    stage: DataSourceType,
    productModel: string;       // 产品型号
    batch: string;              // 批次
    waferId: string;            // 片号

    /** Optional processing sub-stage (e.g., 2 or 3), typically relevant to CP & WLBI stage only */
    retestCount?: number;
    processSubStage?: number;

    /** Optional extracted timestamp from file/folder name */
    time?: string;

    /** Full file path */
    filePath: string;
    lastModified: number;
}

export type DirCollection = { [K in DataSourceType]: DirResult[] };

////////////////////////////////////////////////////////////////////////////////
// NOTE: WaferMetadata slice
////////////////////////////////////////////////////////////////////////////////

// RawWaferMetadata:
// 1. ExcelMetadata -> wafer substrate
// 2. WaferFileMetadata -> wafer maps (FAB-CP, CP-PROBER, WLBI, AOI)

export type RawWaferMetadata = ExcelMetadata | WaferFileMetadata;
export type RawWaferMetadataCollection = RawWaferMetadata[];

// Type guards for RawWaferMetadata

// Check if object is ExcelData
export function isExcelMetadata(item: RawWaferMetadata): item is ExcelMetadata {
    return (
        (item as ExcelMetadata).type !== undefined &&
        typeof (item as ExcelMetadata).type === 'string' // assuming ExcelType is string enum
    );
}

// Check if object is WaferFileMetadata
export function isWaferFileMetadata(item: RawWaferMetadata): item is WaferFileMetadata {
    return (
        typeof (item as WaferFileMetadata).productModel === 'string' &&
        typeof (item as WaferFileMetadata).batch === 'string' &&
        typeof (item as WaferFileMetadata).waferId === 'string'
    );
}
