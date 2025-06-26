// src/api/wafer.ts
import { invoke } from '@tauri-apps/api/core';

import type {
  DefectRecord,
  Wafer,
  WaferMap,
  WaferMapEx,
} from '@/types/Wafer';

export async function parseDefectXls(path: string): Promise<DefectRecord[]> {
  return invoke('parse_defect_xls', { path });
}

export async function parseWafer(path: string): Promise<Wafer> {
  return invoke('parse_wafer', { path });
}

export async function parseWaferMap(path: string): Promise<WaferMap> {
  return invoke('parse_wafer_map', { path });
}

export async function parseWaferMapEx(path: string): Promise<WaferMapEx> {
  return invoke('parse_wafer_map_ex', { path });
}
