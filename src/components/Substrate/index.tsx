import { useEffect, useState } from 'react';
import { Box, Flex, Text, Select } from '@mantine/core';
import { useMantineTheme, Alert } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertCircle } from '@tabler/icons-react';

import SubstrateRenderer from './Wafer';
import Parameters from './Parameters';

import type { SubstrateDefectXlsResult, AsciiDie, WaferMapDie, AsciiMap } from '@/types/ipc';
import type { SubstrateDefectRow, WaferMapRow } from '@/db/types';
import { DataSourceType } from '@/types/dataSource'; // adjust path if needed

// parsing/invoke helpers (adjust import paths to your project)
import { invokeParseSubstrateDefectXls, invokeParseWafer } from '@/api/tauri/wafer';
import { parseWaferMap, parseWaferMapEx } from '@/api/tauri/wafer';
import { useAppSelector } from '@/hooks';

type SubstratePaneProps = {
    productId: string;
    oemProductId: string;
    waferSubstrate: SubstrateDefectRow | null;
    waferMaps: WaferMapRow[];
    showParameters?: boolean;
};

export default function SubstratePane({
    productId,
    oemProductId,
    waferSubstrate,
    waferMaps,
    showParameters = false,
}: SubstratePaneProps) {
    const theme = useMantineTheme();
    const isNarrow = useMediaQuery(`(max-width: ${theme.breakpoints.lg})`);
    // UI params
    const [dieX, setDieX] = useState(1);
    const [dieY, setDieY] = useState(1);
    const [xOffset, setXOffset] = useState(0); // mm
    const [yOffset, setYOffset] = useState(0); // mm
    const [defectSizeOffsetX, setDefectSizeOffsetX] = useState(0); // um
    const [defectSizeOffsetY, setDefectSizeOffsetY] = useState(0); // um

    // Fetched data
    const [sheetsData, setSheetsData] = useState<SubstrateDefectXlsResult | null>(null);
    const [, setDieData] = useState<AsciiDie[] | WaferMapDie[] | null>(null);
    // Sheet selection via dropdown ("__ALL__" = All)
    const [selectedSheetKey, setSelectedSheetKey] = useState<string>('__ALL__');
    const layoutMap = useAppSelector(s => s.waferLayouts.data);

    // Fetch substrate XLS → sheetsData
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!waferSubstrate) {
                    if (!cancelled) setSheetsData(null);
                    return;
                }
                const data = await invokeParseSubstrateDefectXls(waferSubstrate.file_path);
                if (!cancelled) setSheetsData(data);
            } catch (err) {
                console.error('[SubstratePane] parse substrate xls failed:', err);
                if (!cancelled) setSheetsData(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [waferSubstrate]);

    // Fetch wafer map (first waferMaps entry) → dieData
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Fallback: wafer map data
                if (!waferMaps?.length) {
                    if (!cancelled) setDieData(null);
                    return;
                }
                const map = waferMaps[0];

                let data: AsciiMap | WaferMapDie[] | null = null;
                switch (map.stage as DataSourceType) {
                    case DataSourceType.FabCp: {
                        const parsed = await invokeParseWafer(map.file_path);
                        data = parsed.map.dies! as WaferMapDie[];
                        break;
                    }
                    case DataSourceType.Wlbi: {
                        const parsed = await parseWaferMap(map.file_path);
                        data = parsed.map; // WaferMapDie[]
                        break;
                    }
                    case DataSourceType.CpProber:
                    case DataSourceType.Aoi: {
                        const parsed = await parseWaferMapEx(map.file_path);
                        data = parsed.map.dies! as WaferMapDie[];
                        break;
                    }
                    default: {
                        console.warn('[SubstratePane] Unknown stage:', map.stage);
                        data = null;
                    }
                }

                if (!cancelled) setDieData(data);
            } catch (err) {
                console.error('[SubstratePane] parse wafer map failed:', err);
                if (!cancelled) setDieData(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [waferMaps, waferSubstrate]);

    // Build select options from sheet names when available
    const sheetNames = sheetsData ? Object.keys(sheetsData as Record<string, unknown>) : [];
    const sheetOptions = [{ value: '__ALL__', label: 'All' }, ...sheetNames.map((name) => ({ value: name, label: name }))];

    // Keep selection valid when sheets change
    useEffect(() => {
        if (!sheetNames.includes(selectedSheetKey) && selectedSheetKey !== '__ALL__') {
            setSelectedSheetKey('__ALL__');
        }
    }, [sheetNames.join('|')]);

    const selectedSheetId = selectedSheetKey === '__ALL__' ? null : selectedSheetKey;

    const hasLayout = layoutMap && Object.keys(layoutMap).length > 0;
    const productLayoutDies = layoutMap?.[productId]?.dies;
    // Only use Excel layout map; do not fall back to derived wafer map
    const resolvedDies = productLayoutDies;
    const hasResolvedDies = Array.isArray(resolvedDies) && resolvedDies.length > 0;
    const missingProductLayout = !productLayoutDies;

    return (
        <Flex gap="md" style={{ width: '100%' }} direction={isNarrow ? 'column' : 'row'} align="stretch">
            {showParameters && (
                <Parameters
                    oemProductId={oemProductId}
                    minDie={0}
                    maxDie={10}
                    onDieSizeChange={({ dieX, dieY }) => {
                        setDieX(dieX);
                        setDieY(dieY);
                    }}
                    minOffset={-10}
                    maxOffset={10}
                    onOffsetsChange={({ x, y }) => {
                        setXOffset(x);
                        setYOffset(y);
                    }}
                    onDefectSizeOffsetChange={({ x, y }) => {
                        setDefectSizeOffsetX(x);
                        setDefectSizeOffsetY(y);
                    }}
                />
            )}

            <Box style={{ flex: 1, minWidth: 0, height: 'min-content' }}>
                {sheetsData && sheetOptions.length > 1 && (
                    <Box mb="sm">
                        <Text size="sm" c="dimmed" mb={4}>缺陷表选择</Text>
                        <Select
                            data={sheetOptions}
                            value={selectedSheetKey}
                            onChange={(v) => setSelectedSheetKey(v ?? '__ALL__')}
                            allowDeselect={false}
                            searchable
                        nothingFoundMessage="无表"
                    />
                </Box>
                )}
            {!hasLayout && (
                <Alert icon={<IconAlertCircle size={16} />} color="yellow" mb="sm">
                    未找到基板映射 Excel（die layout）。请导入 Excel 映射后再查看。
                </Alert>
            )}
            {sheetsData && missingProductLayout && (
                <Alert icon={<IconAlertCircle size={16} />} color="red" mb="sm">
                    当前机种缺少专用晶圆映射（layoutMap[productId]）。请提供该机种的 Excel 映射。
                </Alert>
            )}
            {sheetsData && !hasResolvedDies && (
                <Alert icon={<IconAlertCircle size={16} />} color="red" mb="sm">
                    当前机种缺少晶圆映射数据，无法渲染衬底。请检查并导入 Excel 基板映射。
                </Alert>
            )}
            {sheetsData && hasResolvedDies && (
                <SubstrateRenderer
                    gridWidth={dieX}
                    gridHeight={dieY}
                    dies={resolvedDies}
                    selectedSheetId={selectedSheetId}
                    sheetsData={sheetsData}
                    gridOffset={{ x: xOffset, y: yOffset }}
                    defectSizeOffset={{ x: defectSizeOffsetX, y: defectSizeOffsetY }}
                    style={{ height: '100%', width: '100%' }}
                />
            )}
            </Box>
        </Flex>
    );
}
