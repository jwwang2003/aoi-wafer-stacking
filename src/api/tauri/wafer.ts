import type {
    BinMapData,
    HexMapData,
    MapData,
    ProductMappingXlsResult,
    ProductXlsResult,
    SubstrateDefectXlsResult,

    Wafer
} from '@/types/Wafer';

import { invokeSafe } from './index';

export async function invokeParseProductMappingXls(path: string): Promise<ProductMappingXlsResult> {
    // Result<HashMap<String, Vec<ProductMappingRecord>>, String>
    return invokeSafe('rust_parse_product_mapping_xls', { path });
}

export async function invokeParseProductXls(path: string): Promise<ProductXlsResult> {
    // Result<HashMap<String, Vec<ProductRecord>>, String>
    return invokeSafe('rust_parse_product_xls', { path });
}

export async function invokeParseSubstrateDefectXls(path: string): Promise<SubstrateDefectXlsResult> {
    return invokeSafe('rust_parse_substrate_defect_xls', { path });
}

// =============================================================================

export async function invokeParseWafer(path: string): Promise<Wafer> {
    // Result<Wafer, String>
    return invokeSafe('rust_parse_wafer', { path });
}

export async function parseWaferMap(path: string): Promise<BinMapData> {
    // Result<BinMapData, String>
    return invokeSafe('rust_parse_wafer_bin', { path });
}
export async function parseWaferMapEx(path: string): Promise<MapData> {
    // Result<MapData, String>
    return invokeSafe('rust_parse_wafer_map_data', { path });
}

// Wafer (.txt-style via Wafer::to_string)
export async function exportWafer(wafer: Wafer, outputPath: string): Promise<void> {
    await invokeSafe('rust_export_wafer', { wafer, outputPath: outputPath });
}
export async function printWafer(wafer: Wafer): Promise<void> {
    await invokeSafe('rust_print_wafer', { wafer });
}

// Bin map (parsed as BinMapData)
export async function exportWaferBin(wafer_bin: BinMapData, outputPath: string): Promise<void> {
    await invokeSafe('rust_export_wafer_bin', { waferBin: wafer_bin, outputPath });
}
export async function printWaferBin(wafer_bin: BinMapData): Promise<void> {
    await invokeSafe('rust_print_wafer_bin', { waferBin: wafer_bin });
}

// MapData (extended text format)
export async function exportWaferMapData(data: MapData, outputPath: string): Promise<void> {
    await invokeSafe('rust_export_wafer_map_data', { data, outputPath });
}
export async function printWaferMapData(data: MapData): Promise<void> {
    await invokeSafe('rust_print_wafer_map_data', { data });
}

// Hex / .sinf (HexMapData)
export async function exportWaferHex(wafer_hex: HexMapData, outputPath: string): Promise<void> {
    await invokeSafe('rust_export_wafer_hex', { waferHex: wafer_hex, outputPath });
}
export async function printWaferHex(wafer_hex: HexMapData): Promise<void> {
    await invokeSafe('rust_print_wafer_hex', { waferHex: wafer_hex });
}