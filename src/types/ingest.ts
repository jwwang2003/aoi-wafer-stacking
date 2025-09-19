export type ProductDefectKey = { oem_product_id: string; lot_id: string; wafer_id: string };

export interface ProductDefectIngestStats {
  input: number;
  unique: number;
  duplicates: number;
  duplicateKeys: ProductDefectKey[];
  existing: number;
  inserted: number;
  updated: number;
  insertedKeys: ProductDefectKey[];
  updatedKeys: ProductDefectKey[];
}

export interface SubstrateDefectIngestStats {
  input: number;
  unique: number;
  duplicates: number;
  duplicateIds: string[];
  existing: number;
  inserted: number;
  updated: number;
  insertedIds: string[];
  updatedIds: string[];
}

export interface WaferMapIngestStats {
  input: number;
  unique: number;
  duplicates: number;
  duplicateFiles: string[];
  existing: number;
  inserted: number;
  updated: number;
  insertedFiles: string[];
  updatedFiles: string[];
}

export interface IngestReport {
  productDefects: ProductDefectIngestStats | null;
  substrateDefects: SubstrateDefectIngestStats | null;
  waferMaps: WaferMapIngestStats | null;
}
