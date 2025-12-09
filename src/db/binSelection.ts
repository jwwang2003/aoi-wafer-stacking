import { getDb } from '@/db/index';

export interface ProductBinSelection {
    oem_product_id: string;
    selected_bin_ids: string;
}

const TABLE = 'product_bin_selection';
const COLUMNS = 'oem_product_id, selected_bin_ids';

/**
 * 获取指定OEM产品的BIN/缺陷类别选择配置
 * @param oem_product_id OEM产品编号
 * @returns 配置记录，无记录时返回默认全选配置
 */
export async function getProductBinSelection(
    oem_product_id: string
): Promise<ProductBinSelection> {
    const db = await getDb();
    const rows = await db.select<ProductBinSelection[]>(
        `SELECT ${COLUMNS} FROM ${TABLE} WHERE oem_product_id = ?`,
        [oem_product_id]
    );

    return rows[0] ?? {
        oem_product_id,
        selected_bin_ids: '*'
    };
}

/**
 * 保存OEM产品的BIN/缺陷类别选择配置
 * @param selection 配置信息
 */
export async function saveProductBinSelection(
    selection: ProductBinSelection
): Promise<void> {
    const db = await getDb();
    const sql = `
    INSERT INTO ${TABLE} (oem_product_id, selected_bin_ids)
    VALUES (?, ?)
    ON CONFLICT(oem_product_id) DO UPDATE SET
      selected_bin_ids = excluded.selected_bin_ids
  `;
    await db.execute(sql, [
        selection.oem_product_id,
        selection.selected_bin_ids
    ]);
}

/**
 * 将存储的字符串转换为BIN/缺陷类别ID数组
 * @param storedValue 数据库中存储的字符串（如"a,b,c"或"*"）
 * @param allBins 所有可用的BIN/缺陷类别列表
 * @returns 解析后的选中列表
 */
export function parseSelectedBins(
    storedValue: string,
    allBins: string[]
): string[] {
    return storedValue === '*'
        ? [...allBins]
        : storedValue.split(',').filter(id => allBins.includes(id));
}

/**
 * 将选中的BIN/缺陷类别数组转换为存储字符串
 * @param selectedBins 选中的列表
 * @param allBins 所有可用的BIN/缺陷类别列表
 * @returns 待存储的字符串（如"a,b,c"或"*"）
 */
export function stringifySelectedBins(
    selectedBins: string[],
    allBins: string[]
): string {
    if (selectedBins.length === allBins.length &&
        selectedBins.every(id => allBins.includes(id))) {
        return '*';
    }
    return selectedBins.join(',');
}