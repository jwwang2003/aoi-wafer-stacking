import { useAppDispatch, useAppSelector } from '@/hooks';
import { setOffsets } from '@/slices/preferencesSlice';
import { SubstrateDefectRecord } from '@/types/wafer';
import { invokeParseSubstrateDefectXls } from '@/api/tauri/wafer';

import {
    Group,
    NumberInput,
    Slider,
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
// import { open } from "@tauri-apps/api/dialog";
import SubstrateRenderer from '@/components/Wafer';

interface SheetInfo {
    id: string;
    name: string;
}

function SubstrateThreeView({
  xOffset,
  yOffset,
  selectedSheetId,
  sheetsData,
}: OffsetConfig & {
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
        // 传递预设的格子尺寸：4.134mm × 3.74mm
        gridWidth={4.134}
        gridHeight={3.74}
        overlapColor={0xfa5959}
        // 将偏移量作为网格位置参数传递，而不是通过CSS变换
        gridOffset={{ x: xOffset, y: yOffset }}
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
      ></Box>
    </Box>
  );
}

export default function SubstrateConfigPage() {
    const dispatch = useAppDispatch();
    const offset = useAppSelector((state) => state.preferences.offsets);
    const [filePath, setFilePath] = useState('86107919CNF1.xls');
    const [error, setError] = useState('');
    const [sheets, setSheets] = useState<SheetInfo[]>([]);
    const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
    const [sheetsData, setSheetsData] = useState<
        Record<string, SubstrateDefectRecord[]>
    >({});
    const [loadingSheets, setLoadingSheets] = useState(false);

    const loadSheetsData = async () => {
        if (!filePath) return;

        setLoadingSheets(true);
        setError('');
        setSheets([]);
        setSheetsData({});

        try {
            const result = await invokeParseSubstrateDefectXls(filePath);
            const sheetList: SheetInfo[] = Object.entries(result).map(
                ([id], index) => ({
                    id,
                    name: `工作表 ${index + 1}`,
                })
            );

            setSheets(sheetList);
            setSheetsData(result as Record<string, SubstrateDefectRecord[]>);

            if (sheetList.length > 0) {
                setSelectedSheetId(sheetList[0].id);
            } else {
                setError('Excel文件中未找到任何工作表');
            }
        } catch (err) {
            console.error('加载工作表失败:', err);
            setError(
                '加载工作表失败: ' + (err instanceof Error ? err.message : String(err))
            );
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
                setError(
                    '默认路径解析失败: ' +
                    (err instanceof Error ? err.message : String(err))
                );
            }
        };

        validateDefaultPath();
    }, []);

    useEffect(() => {
        if (filePath) {
            loadSheetsData();
        }
    }, [filePath]);

    const handlePrevSheet = () => {
        if (sheets.length === 0 || !selectedSheetId) return;

        const currentIndex = sheets.findIndex(
            (sheet) => sheet.id === selectedSheetId
        );
        const prevIndex = (currentIndex - 1 + sheets.length) % sheets.length;
        setSelectedSheetId(sheets[prevIndex].id);
    };

    const handleNextSheet = () => {
        if (sheets.length === 0 || !selectedSheetId) return;

        const currentIndex = sheets.findIndex(
            (sheet) => sheet.id === selectedSheetId
        );
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
                    setError(
                        '选中的文件无法访问: ' +
                        (err instanceof Error ? err.message : String(err))
                    );
                }
            }
        } catch (err) {
            console.error('[文件选择] 对话框错误:', err);
            setError(
                '选择文件失败: ' + (err instanceof Error ? err.message : String(err))
            );
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
            setError(
                '路径无效: ' + (err instanceof Error ? err.message : String(err))
            );
        }
    };

    const updateOffset = async (key: keyof OffsetConfig, value: number) => {
        await dispatch(setOffsets({ [key]: value }));
    };

    const renderControl = (
        label: string,
        key: keyof OffsetConfig,
        min: number,
        max: number,
        step: number
    ) => (
        <Group align="center">
            <NumberInput
                label={label}
                value={offset[key] || 0}
                onChange={(val) => updateOffset(key, Number(val))}
                min={min}
                max={max}
                step={step}
                w={120}
            />
            <Slider
                value={offset[key] || 0}
                onChange={(val) => updateOffset(key, val)}
                min={min}
                max={max}
                step={step}
                style={{ flex: 1 }}
            />
        </Group>
    );

    return (
        <Flex gap="lg" align="flex-start" justify="space-between">
            {/* Left Panel: Controls */}
            <Stack w="50%" gap="md">
                <Title order={2}>衬底配置</Title>
                <Text>在此处调整衬底的偏移量、缩放和扭曲强度。</Text>

                {/* 文件路径输入区域 */}
                <Group align="flex-end" gap="sm" style={{ width: '100%' }}>
                    <InputWrapper label="文件路径" style={{ flex: 1, marginBottom: 0 }}>
                        <Input
                            value={filePath}
                            onChange={handlePathInput}
                            placeholder="输入文件路径"
                        />
                    </InputWrapper>
                    <Button onClick={selectFile}>选择文件</Button>
                </Group>

                {/* 工作表切换按钮 */}
                <Group>
                    <Button
                        onClick={handlePrevSheet}
                        disabled={loadingSheets || sheets.length <= 1}
                    >
                        上一个工作表
                    </Button>
                    <Button
                        onClick={handleNextSheet}
                        disabled={loadingSheets || sheets.length <= 1}
                    >
                        下一个工作表
                    </Button>
                    {selectedSheetId && sheets.length > 0 && (
                        <Text>
                            当前: {sheets.find((s) => s.id === selectedSheetId)?.name || ''}
                        </Text>
                    )}
                </Group>

                <Text size="sm" c={error ? 'red' : 'blue'}>
                    {loadingSheets
                        ? '加载工作表中...'
                        : error
                            ? error
                            : `当前使用的完整路径: ${filePath}`}
                </Text>

                {renderControl('X 偏移量', 'xOffset', -100, 100, 1)}
                {renderControl('Y 偏移量', 'yOffset', -100, 100, 1)}
                {renderControl('左侧偏移', 'leftOffset', -100, 100, 1)}
                {renderControl('右侧偏移', 'rightOffset', -100, 100, 1)}
                {renderControl('顶部偏移', 'topOffset', -100, 100, 1)}
                {renderControl('底部偏移', 'bottomOffset', -100, 100, 1)}
                {renderControl('缩放 (Scale)', 'scale', 0.1, 10, 0.1)}
                {renderControl('扭曲 (Warp)', 'warp', -100, 100, 1)}

                <Text size="sm" c="dimmed" mt="xs">
                    所有更改都会自动保存，无需手动操作。
                </Text>
            </Stack>

            {/* Right Panel: Three.js Canvas */}
            <Box w="50%">
                <SubstrateThreeView
                    {...offset}
                    filePath={filePath}
                    selectedSheetId={selectedSheetId}
                    sheetsData={sheetsData}
                />
            </Box>
        </Flex>
    );
}
