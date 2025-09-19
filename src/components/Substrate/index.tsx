import { useEffect, useState } from 'react';
import { Box, Flex, Group, Text, Select } from '@mantine/core';
import { useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import SubstrateRenderer from './Wafer';
import Parameters from './Parameters';

import type { SubstrateDefectXlsResult, AsciiDie, WaferMapDie, AsciiMap } from '@/types/ipc';
import type { SubstrateDefectRow, WaferMapRow } from '@/db/types';
import { DataSourceType } from '@/types/dataSource'; // adjust path if needed

// parsing/invoke helpers (adjust import paths to your project)
import { invokeParseSubstrateDefectXls, invokeParseWafer } from '@/api/tauri/wafer';
import { parseWaferMap, parseWaferMapEx } from '@/api/tauri/wafer';

type SubstratePaneProps = {
    oemProductId: string;
    waferSubstrate: SubstrateDefectRow | null;
    waferMaps: WaferMapRow[];
    showParameters?: boolean;
};

export default function SubstratePane({
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

    // Fetched data
    const [sheetsData, setSheetsData] = useState<SubstrateDefectXlsResult | null>(null);
    const [dieData, setDieData] = useState<AsciiDie[] | WaferMapDie[] | null>(null);
    // Sheet selection via dropdown ("__ALL__" = All)
    const [selectedSheetKey, setSelectedSheetKey] = useState<string>('__ALL__');

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
    }, [waferMaps]);

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
                />
            )}

            <Box style={{ flex: 1, minWidth: 0, height: 'min-content' }}>
                {sheetsData && sheetOptions.length > 1 && (
                    <Box mb="sm">
                        <Group justify="space-between" mb={4}>
                            <Text size="sm" c="dimmed">缺陷表选择</Text>
                        </Group>
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
                {sheetsData && dieData && (
                    <SubstrateRenderer
                        gridWidth={dieX}
                        gridHeight={dieY}
                        dies={dieData}
                        selectedSheetId={selectedSheetId}
                        sheetsData={sheetsData}
                        gridOffset={{ x: xOffset, y: yOffset }}
                        style={{ height: '100%', width: '100%' }}
                    />
                )}
            </Box>
        </Flex>
    );
}
