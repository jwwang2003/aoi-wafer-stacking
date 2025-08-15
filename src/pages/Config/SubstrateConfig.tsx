import { SubstrateDefectRecord } from '@/types/ipc';
import { invokeParseSubstrateDefectXls } from '@/api/tauri/wafer';

import {
    Group,
    Stack,
    Text,
    Title,
    Box,
    Flex,
    Input,
    Button,
    InputWrapper,
} from '@mantine/core';
import { useState, useEffect } from 'react';
import { resolveResource } from '@tauri-apps/api/path';
import SubstrateRenderer from '@/components/Wafer';

interface SheetInfo {
    id: string;
    name: string;
}

function SubstrateThreeView({
    // filePath,
    selectedSheetId,
    sheetsData,
}: {
    filePath: string;
    selectedSheetId: string | null;
    sheetsData: Record<string, SubstrateDefectRecord[]>;
}) {
    return (
        <Box
            style={{
                height: '600px',
                borderRadius: '8px',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <SubstrateRenderer
                // 预设格子尺寸：4.134mm × 3.74mm
                gridWidth={4.134}
                gridHeight={3.74}
                overlapColor={0xfa5959}
                selectedSheetId={selectedSheetId}
                sheetsData={sheetsData}
            />
            <Box
                style={{
                    position: 'absolute',
                    bottom: '16px',
                    right: '16px',
                    display: 'flex',
                    gap: '8px',
                }}
            />
        </Box>
    );
}

export default function SubstrateConfigPage() {
    const [filePath, setFilePath] = useState('86107919CNF1.xls');
    const [error, setError] = useState('');
    const [sheets, setSheets] = useState<SheetInfo[]>([]);
    const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
    const [sheetsData, setSheetsData] = useState<Record<string, SubstrateDefectRecord[]>>({});
    const [loadingSheets, setLoadingSheets] = useState(false);

    const loadSheetsData = async () => {
        if (!filePath) return;

        setLoadingSheets(true);
        setError('');
        setSheets([]);
        setSheetsData({});

        try {
            const result = await invokeParseSubstrateDefectXls(filePath);
            const sheetList: SheetInfo[] = Object.entries(result).map(([id], index) => ({
                id,
                name: `工作表 ${index + 1}`,
            }));

            setSheets(sheetList);
            setSheetsData(result as Record<string, SubstrateDefectRecord[]>);

            if (sheetList.length > 0) {
                setSelectedSheetId(sheetList[0].id);
            } else {
                setError('Excel文件中未找到任何工作表');
            }
        } catch (err) {
            console.error('加载工作表失败:', err);
            setError('加载工作表失败: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setLoadingSheets(false);
        }
    };

    useEffect(() => {
        const validateDefaultPath = async () => {
            console.log('[初始化] 默认文件路径:', filePath);
            try {
                const resolvedPath = await resolveResource(filePath);
                console.log('[初始化] 解析后的默认路径:', resolvedPath);
                setFilePath(resolvedPath);
                await loadSheetsData();
            } catch (err) {
                console.error('[初始化] 默认路径解析失败:', err);
                setError('默认路径解析失败: ' + (err instanceof Error ? err.message : String(err)));
            }
        };

        validateDefaultPath();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (filePath) {
            loadSheetsData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filePath]);

    const handlePrevSheet = () => {
        if (sheets.length === 0 || !selectedSheetId) return;

        const currentIndex = sheets.findIndex((sheet) => sheet.id === selectedSheetId);
        const prevIndex = (currentIndex - 1 + sheets.length) % sheets.length;
        setSelectedSheetId(sheets[prevIndex].id);
    };

    const handleNextSheet = () => {
        if (sheets.length === 0 || !selectedSheetId) return;

        const currentIndex = sheets.findIndex((sheet) => sheet.id === selectedSheetId);
        const nextIndex = (currentIndex + 1) % sheets.length;
        setSelectedSheetId(sheets[nextIndex].id);
    };

    const selectFile = async () => {
        try {
            setError('');
            const selected = await open();

            if (selected && typeof selected === 'string') {
                console.log('[文件选择] 用户选中的完整路径:', selected);
                setFilePath(selected);

                try {
                    const resolved = await resolveResource(selected);
                    console.log('[文件选择] 验证通过的路径:', resolved);
                } catch (err) {
                    console.error('[文件选择] 选中的文件无法访问:', err);
                    setError('选中的文件无法访问: ' + (err instanceof Error ? err.message : String(err)));
                }
            }
        } catch (err) {
            console.error('[文件选择] 对话框错误:', err);
            setError('选择文件失败: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    const handlePathInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputPath = e.target.value;
        console.log('[手动输入] 用户输入的路径:', inputPath);

        try {
            const resolvedPath = await resolveResource(inputPath);
            console.log('[手动输入] 解析后的完整路径:', resolvedPath);
            setFilePath(resolvedPath);
            setError('');
        } catch (err) {
            console.error('[手动输入] 路径解析错误:', err);
            setFilePath(inputPath);
            setError('路径无效: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    return (
        <Flex gap="lg" align="flex-start" justify="space-between">
            {/* Left Panel: Controls */}
            <Stack w="50%" gap="md">
                <Title order={2}>衬底查看</Title>

                {/* 文件路径输入区域 */}
                <Group align="flex-end" gap="sm" style={{ width: '100%' }}>
                    <InputWrapper label="文件路径" style={{ flex: 1, marginBottom: 0 }}>
                        <Input value={filePath} onChange={handlePathInput} placeholder="输入文件路径" />
                    </InputWrapper>
                    <Button onClick={selectFile}>选择文件</Button>
                </Group>

                {/* 工作表切换按钮 */}
                <Group>
                    <Button onClick={handlePrevSheet} disabled={loadingSheets || sheets.length <= 1}>
                        上一个工作表
                    </Button>
                    <Button onClick={handleNextSheet} disabled={loadingSheets || sheets.length <= 1}>
                        下一个工作表
                    </Button>
                    {selectedSheetId && sheets.length > 0 && (
                        <Text>当前: {sheets.find((s) => s.id === selectedSheetId)?.name || ''}</Text>
                    )}
                </Group>

                <Text size="sm" c={error ? 'red' : 'blue'}>
                    {loadingSheets ? '加载工作表中...' : error ? error : `当前使用的完整路径: ${filePath}`}
                </Text>
            </Stack>

            {/* Right Panel: Canvas */}
            <Box w="50%">
                <SubstrateThreeView
                    filePath={filePath}
                    selectedSheetId={selectedSheetId}
                    sheetsData={sheetsData}
                />
            </Box>
        </Flex>
    );
}
