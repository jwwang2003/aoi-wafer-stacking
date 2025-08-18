import { useEffect, useState } from 'react';
import { Box, Flex } from '@mantine/core';

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
    // UI params
    const [dieX, setDieX] = useState(1);
    const [dieY, setDieY] = useState(1);
    const [xOffset, setXOffset] = useState(0); // mm
    const [yOffset, setYOffset] = useState(0); // mm

    // Fetched data
    const [sheetsData, setSheetsData] = useState<SubstrateDefectXlsResult | null>(null);
    const [dieData, setDieData] = useState<AsciiDie[] | WaferMapDie[] | null>(null);

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
                        data = parsed.map; // AsciiMap
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

                if (!cancelled) setDieData(data as any);
            } catch (err) {
                console.error('[SubstratePane] parse wafer map failed:', err);
                if (!cancelled) setDieData(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [waferMaps]);

    return (
        <Flex gap="md" style={{ height: 'calc(100vh - 50px)', width: '100%' }}>
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

            <Box style={{ flex: 1, minWidth: 0 }}>
                {sheetsData && dieData && (
                    <SubstrateRenderer
                        gridWidth={dieX}
                        gridHeight={dieY}
                        dies={dieData}
                        selectedSheetId="Surface defect list"
                        sheetsData={sheetsData}
                        gridOffset={{ x: xOffset, y: yOffset }}
                        style={{ height: '100%', width: '100%' }}
                    />
                )}
            </Box>
        </Flex>
    );
}
