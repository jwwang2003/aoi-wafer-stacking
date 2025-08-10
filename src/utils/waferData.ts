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