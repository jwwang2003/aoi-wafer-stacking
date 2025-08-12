// 输入文件路径配置
export const inputFormats = {
    衬底: '',
    AOI: '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/DEMO/AOI-01/S1M040120B_B003990/S1M040120B_B003990_02_20250721095040.txt',
    CP1: '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/DEMO/CP-prober-01/S1M040120B_B003990_1_0/S1M040120B_B003990_02/S1M040120B_B003990_02_mapEx.txt',
    CP2: '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/DEMO/CP-prober-02/S1M040120B_B003990_2_0/S1M040120B_B003990_02/S1M040120B_B003990_02_mapEx.txt',
    CP3: '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/DEMO/FAB CP/BinMap/B003990/P0097B_B003990_02.txt',
    WLBI: '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/DEMO/WLBI-02/S1M040120B_B003990_1_0/WaferMap/B003990-02_20250325_165831.WaferMap',
};

// 输出目录配置
export const outputFormats = {
    debug: '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/输出文件/debug',
    mapEx: '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/输出文件/mapEx',
    wafermap: '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/输出文件/wafermap',
    HEX: '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/输出文件/HEX',
};

export const allLayers = ['衬底', 'CP1', 'CP2', 'WLBI', 'CP3', 'AOI'];

export const baseFileName = 'S1M040120B_B003990_02';
