import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    Divider,
    Group,
    Slider,
    Stack,
    Text,
    Title,
    Tooltip,
    Loader,
    NumberInput,
} from '@mantine/core';
import { useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconDatabase, IconDeviceFloppy, IconEraser, IconTrash } from '@tabler/icons-react';
import { errorToast } from '@/components/UI/Toaster';
import { useAppSelector } from '@/hooks';
import { AuthRole } from '@/types/auth';
import { IS_DEV } from '@/env';

// Offsets (existing)
import { getOemOffset, upsertOemOffset, deleteOemOffset, deleteOemDefectOffset } from '@/db/offsets';

// Die sizes (new)
import {
    getProductSize,
    upsertProductSize,
    deleteProductSize,
} from '@/db/productSize';

import type { ProductSize } from '@/db/types';

type ParametersProps = {
    oemProductId: string;

    // 🔁 live render callbacks
    onOffsetsChange?: (vals: { x: number; y: number }) => void;
    onDieSizeChange?: (vals: { dieX: number; dieY: number }) => void;
    onDefectSizeOffsetChange?: (vals: { x: number; y: number }) => void;

    // Offset constraints (mm)
    minOffset?: number; // default -1
    maxOffset?: number; // default 1
    stepOffset?: number; // default 0.01

    // Die size constraints (mm)
    minDie?: number; // default 0
    maxDie?: number; // default 50
    stepDie?: number; // default 0.001

    // Defect size offset constraints (mm)
    minDefectSizeOffset?: number;
    maxDefectSizeOffset?: number;
    stepDefectSizeOffset?: number;

};

export default function Parameters({
    oemProductId,
    onOffsetsChange,
    onDieSizeChange,
    onDefectSizeOffsetChange,
    // Offsets
    minOffset: minOff = -1,
    maxOffset: maxOff = 1,
    stepOffset: stepOff = 0.001,
    // Die size
    minDie = 0,
    maxDie = 50,
    // Defect size offset
    minDefectSizeOffset = -1000,
    maxDefectSizeOffset = 1000,
    stepDefectSizeOffset = 0.001,
    stepDie = 0.001,
}: ParametersProps) {
    const theme = useMantineTheme();
    const isNarrow = useMediaQuery(`(max-width: ${theme.breakpoints.lg})`);
    const role = useAppSelector(s => s.auth.role);
    const readOnlyMode = !IS_DEV && role !== AuthRole.Admin;
    // --------------------------
    // Offset state
    // --------------------------
    const [xOffset, setXOffset] = useState(0);
    const [yOffset, setYOffset] = useState(0);
    const [defectSizeOffsetX, setDefectSizeOffsetX] = useState(0);
    const [defectSizeOffsetY, setDefectSizeOffsetY] = useState(0);
    const [loadingOffset, setLoadingOffset] = useState(false);
    const [loadingDefectSizeOffset, setLoadingDefectSizeOffset] = useState(false);
    const [savingOffset, setSavingOffset] = useState(false);
    const [savingDefectSizeOffset, setSavingDefectSizeOffset] = useState(false);
    const [dbHasOffset, setDbHasOffset] = useState<boolean>(false);
    const [dbHasDefectSizeOffset, setDbHasDefectSizeOffset] = useState<boolean>(false);
    const lastSavedOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const lastSavedDefectSizeOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // live callback
    useEffect(() => {
        onOffsetsChange?.({ x: xOffset, y: yOffset });
    }, [xOffset, yOffset, onOffsetsChange]);

    useEffect(() => {
        onDefectSizeOffsetChange?.({ x: defectSizeOffsetX, y: defectSizeOffsetY });
    }, [defectSizeOffsetX, defectSizeOffsetY, onDefectSizeOffsetChange]);

    // Load offset
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingOffset(true);
            setLoadingDefectSizeOffset(true);
            try {
                const found = await getOemOffset(oemProductId);
                if (cancelled) return;
                if (found) {
                    setXOffset(found.x_offset);
                    setYOffset(found.y_offset);
                    setDefectSizeOffsetX(found.defect_offset_x);
                    setDefectSizeOffsetY(found.defect_offset_y);
                    lastSavedOffsetRef.current = { x: found.x_offset, y: found.y_offset };
                    lastSavedDefectSizeOffsetRef.current = { x: found.defect_offset_x, y: found.defect_offset_y };
                    setDbHasOffset(true);
                    setDbHasDefectSizeOffset(true);
                } else {
                    setXOffset(0);
                    setYOffset(0);
                    setDefectSizeOffsetX(0);
                    setDefectSizeOffsetY(0);
                    lastSavedOffsetRef.current = { x: 0, y: 0 };
                    setDbHasOffset(false);
                    lastSavedDefectSizeOffsetRef.current = { x: 0, y: 0 };
                    setDbHasDefectSizeOffset(false);
                }
            } catch (e) {
                errorToast({ title: '读取失败', message: `加载偏移失败: ${String(e)}` });
            } finally {
                if (!cancelled) setLoadingOffset(false);
                if (!cancelled) setLoadingDefectSizeOffset(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [oemProductId]);

    // Helpers (offset)
    const clampOff = (v: number) => Math.min(maxOff, Math.max(minOff, v));
    const changedOffset = (nx: number, ny: number) => {
        const { x: lx, y: ly } = lastSavedOffsetRef.current;
        return nx !== lx || ny !== ly || !dbHasOffset;
    };

    const DefectclampOff = (v: number) => Math.min(maxDefectSizeOffset, Math.max(minDefectSizeOffset, v));
    const changedDefectSizeOffset = (nx: number, ny: number) => {
        const { x: lx, y: ly } = lastSavedDefectSizeOffsetRef.current;
        return nx !== lx || ny !== ly || !dbHasDefectSizeOffset;
    };

    // Persist offset
    const persistOffsets = async (nx = xOffset, ny = yOffset) => {
        const cx = clampOff(nx);
        const cy = clampOff(ny);
        if (!changedOffset(cx, cy)) return;

        setSavingOffset(true);
        try {
            await upsertOemOffset({ oem_product_id: oemProductId, x_offset: cx, y_offset: cy, defect_offset_x: defectSizeOffsetX, defect_offset_y: defectSizeOffsetY });
            lastSavedOffsetRef.current = { x: cx, y: cy };
            setDbHasOffset(true);
        } catch (e) {
            errorToast({ title: '保存失败', message: `写入偏移失败: ${String(e)}` });
        } finally {
            setSavingOffset(false);
        }
    };

    const persistDefectSizeOffsets = async (nx = defectSizeOffsetX, ny = defectSizeOffsetY) => {
        const cx = DefectclampOff(nx);
        const cy = DefectclampOff(ny);
        if (!changedDefectSizeOffset(cx, cy)) return;

        setSavingDefectSizeOffset(true);
        try {
            await upsertOemOffset({ oem_product_id: oemProductId, x_offset: lastSavedOffsetRef.current.x, y_offset: lastSavedOffsetRef.current.y, defect_offset_x: cx, defect_offset_y: cy });
            lastSavedDefectSizeOffsetRef.current = { x: cx, y: cy };
            setDbHasDefectSizeOffset(true);
        } catch (e) {
            errorToast({ title: '保存失败', message: `写入偏移失败: ${String(e)}` });
        } finally {
            setSavingDefectSizeOffset(false);
        }
    };

    const handleResetOffset = () => {
        setXOffset(0);
        setYOffset(0);
    };

    const handleResetDefectSizeOffset = () => {
        setDefectSizeOffsetX(0);
        setDefectSizeOffsetY(0);
    };

    const handleDeleteOffset = async () => {
        if (!dbHasOffset) return;
        setSavingOffset(true);
        try {
            await deleteOemOffset(oemProductId);
            setDbHasOffset(false);
            setXOffset(0);
            setYOffset(0);
            lastSavedOffsetRef.current = { x: 0, y: 0 };
        } catch (e) {
            errorToast({ title: '删除失败', message: `删除偏移记录失败: ${String(e)}` });
        } finally {
            setSavingOffset(false);
        }
    };

    const handleDeleteDefectSizeOffset = async () => {
        if (!dbHasDefectSizeOffset) return;
        setSavingDefectSizeOffset(true);
        try {
            await deleteOemDefectOffset(oemProductId);
            setDbHasDefectSizeOffset(false);
            setDefectSizeOffsetX(0);
            setDefectSizeOffsetY(0);
            lastSavedDefectSizeOffsetRef.current = { x: 0, y: 0 };
        } catch (e) {
            errorToast({ title: '删除失败', message: `删除偏移记录失败: ${String(e)}` });
        } finally {
            setSavingDefectSizeOffset(false);
        }
    };


    const offsetControlsDisabled = useMemo(
        () => readOnlyMode || loadingOffset || savingOffset,
        [readOnlyMode, loadingOffset, savingOffset]
    );

    const defectOffsetControlsDisabled = useMemo(
        () => readOnlyMode || loadingDefectSizeOffset || savingDefectSizeOffset,
        [readOnlyMode, loadingDefectSizeOffset, savingDefectSizeOffset]
    );

    // Offset inputs
    const onXOffInputChange = (val: string | number) => {
        const n = typeof val === 'number' ? val : parseFloat(val);
        if (Number.isFinite(n)) setXOffset(n);
    };
    const onYOffInputChange = (val: string | number) => {
        const n = typeof val === 'number' ? val : parseFloat(val);
        if (Number.isFinite(n)) setYOffset(n);
    };
    const onDefectXOffInputChange = (val: string | number) => {
        const n = typeof val === 'number' ? val : parseFloat(val);
        if (Number.isFinite(n)) setDefectSizeOffsetX(n);
    };
    const onDefectYOffInputChange = (val: string | number) => {
        const n = typeof val === 'number' ? val : parseFloat(val);
        if (Number.isFinite(n)) setDefectSizeOffsetY(n);
    };


    const onXOffBlur = () => {
        const nx = clampOff(Number.isFinite(xOffset) ? xOffset : 0);
        if (nx !== xOffset) setXOffset(nx);
        persistOffsets(nx, yOffset);
    };
    const onYOffBlur = () => {
        const ny = clampOff(Number.isFinite(yOffset) ? yOffset : 0);
        if (ny !== yOffset) setYOffset(ny);
        persistOffsets(xOffset, ny);
    };
    const onDefectXOffBlur = () => {
        const nx = clampOff(Number.isFinite(defectSizeOffsetX) ? defectSizeOffsetX : 0);
        if (nx !== defectSizeOffsetX) setDefectSizeOffsetX(nx);
        persistDefectSizeOffsets(nx, defectSizeOffsetY);
    };
    const onDefectYOffBlur = () => {
        const ny = clampOff(Number.isFinite(defectSizeOffsetY) ? defectSizeOffsetY : 0);
        if (ny !== defectSizeOffsetY) setDefectSizeOffsetY(ny);
        persistDefectSizeOffsets(defectSizeOffsetX, ny);
    };
    const onXOffKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === 'Enter') onXOffBlur();
    };
    const onYOffKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === 'Enter') onYOffBlur();
    };
    const onDefectXOffKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === 'Enter') onDefectXOffBlur();
    };
    const onDefectYOffKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === 'Enter') onDefectYOffBlur();
    };

    // --------------------------
    // Die size state
    // --------------------------
    const [dieX, setDieX] = useState(1);
    const [dieY, setDieY] = useState(1);
    const [loadingSize, setLoadingSize] = useState(false);
    const [savingSize, setSavingSize] = useState(false);
    const [dbHasSize, setDbHasSize] = useState<boolean>(false);
    const lastSavedSizeRef = useRef<{ dieX: number; dieY: number }>({ dieX: 0, dieY: 0 });

    // live callback
    useEffect(() => {
        onDieSizeChange?.({ dieX, dieY });
    }, [dieX, dieY, onDieSizeChange]);

    // Load size
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingSize(true);
            try {
                const row = await getProductSize(oemProductId);
                if (cancelled) return;
                if (row) {
                    setDieX(row.die_x);
                    setDieY(row.die_y);
                    lastSavedSizeRef.current = { dieX: row.die_x, dieY: row.die_y };
                    setDbHasSize(true);
                } else {
                    // Default to 1mm x 1mm when no DB data
                    setDieX(1);
                    setDieY(1);
                    lastSavedSizeRef.current = { dieX: 1, dieY: 1 };
                    setDbHasSize(false);
                }
            } catch (e) {
                errorToast({ title: '读取失败', message: `加载晶粒尺寸失败: ${String(e)}` });
            } finally {
                if (!cancelled) setLoadingSize(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [oemProductId]);

    // Helpers (size)
    const clampDie = (v: number) => Math.min(maxDie, Math.max(minDie, v));
    const changedSize = (nx: number, ny: number) => {
        const { dieX: lx, dieY: ly } = lastSavedSizeRef.current;
        return nx !== lx || ny !== ly || !dbHasSize;
    };

    // Persist size
    const persistSize = async (nx = dieX, ny = dieY) => {
        const cx = clampDie(nx);
        const cy = clampDie(ny);
        if (!changedSize(cx, cy)) return;

        setSavingSize(true);
        try {
            await upsertProductSize({ oem_product_id: oemProductId, die_x: cx, die_y: cy } as ProductSize);
            lastSavedSizeRef.current = { dieX: cx, dieY: cy };
            setDbHasSize(true);
        } catch (e) {
            errorToast({ title: '保存失败', message: `写入晶粒尺寸失败: ${String(e)}` });
        } finally {
            setSavingSize(false);
        }
    };

    const handleResetSize = () => {
        // Reset UI controls to sensible default (does not write DB)
        setDieX(1);
        setDieY(1);
    };

    const handleDeleteSize = async () => {
        if (!dbHasSize) return;
        setSavingSize(true);
        try {
            await deleteProductSize(oemProductId);
            setDbHasSize(false);
            // Default to 1mm x 1mm after deletion
            setDieX(1);
            setDieY(1);
            lastSavedSizeRef.current = { dieX: 1, dieY: 1 };
        } catch (e) {
            errorToast({ title: '删除失败', message: `删除晶粒尺寸记录失败: ${String(e)}` });
        } finally {
            setSavingSize(false);
        }
    };

    const sizeControlsDisabled = useMemo(() => readOnlyMode || loadingSize || savingSize, [readOnlyMode, loadingSize, savingSize]);

    // Size inputs
    const onDieXChange = (val: string | number) => {
        const n = typeof val === 'number' ? val : parseFloat(val);
        if (Number.isFinite(n)) setDieX(n);
    };
    const onDieYChange = (val: string | number) => {
        const n = typeof val === 'number' ? val : parseFloat(val);
        if (Number.isFinite(n)) setDieY(n);
    };
    const onDieXBlur = () => {
        const nx = clampDie(Number.isFinite(dieX) ? dieX : 0);
        if (nx !== dieX) setDieX(nx);
        persistSize(nx, dieY);
    };
    const onDieYBlur = () => {
        const ny = clampDie(Number.isFinite(dieY) ? dieY : 0);
        if (ny !== dieY) setDieY(ny);
        persistSize(dieX, ny);
    };
    const onDieXKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === 'Enter') onDieXBlur();
    };
    const onDieYKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === 'Enter') onDieYBlur();
    };

    return (
        <Box
            w={isNarrow ? '100%' : 320}
            p="md"
            style={{
                borderRight: isNarrow ? 'none' : '1px solid var(--mantine-color-gray-3)',
                borderBottom: isNarrow ? '1px solid var(--mantine-color-gray-3)' : 'none',
            }}
        >
            <Stack gap="xl">
                {/* ---------------------- Die size ---------------------- */}
                <Group justify="space-between" align="center">
                    <Title order={5}>晶粒尺寸 (mm)</Title>
                    {loadingSize ? (
                        <Group gap={6}>
                            <Loader size="xs" />
                            <Text size="xs" c="dimmed">加载中</Text>
                        </Group>
                    ) : (
                        <Group gap={6}>
                            <IconDatabase size={16} />
                            <Text size="xs" c={dbHasSize ? 'teal' : 'dimmed'}>
                                {dbHasSize ? '已有记录' : '未保存'}
                            </Text>
                        </Group>
                    )}
                </Group>

                {/* dieX */}
                <Stack gap={6}>
                    <Group justify="space-between" align="center">
                        <Text size="sm" c="dimmed">Die X</Text>
                        <NumberInput
                            size="xs"
                            w={120}
                            value={dieX}
                            step={stepDie}
                            min={minDie}
                            max={maxDie}
                            disabled={sizeControlsDisabled}
                            onChange={onDieXChange}
                            onBlur={onDieXBlur}
                            onKeyDown={onDieXKeyDown}
                            decimalScale={6}
                            clampBehavior="strict"
                            suffix=" mm"
                        />
                    </Group>
                    <Slider
                        min={minDie}
                        max={maxDie}
                        step={stepDie}
                        value={dieX}
                        disabled={sizeControlsDisabled}
                        onChange={setDieX}
                        onChangeEnd={(val) => persistSize(val, dieY)}
                        marks={[
                            { value: minDie, label: String(minDie) },
                            { value: (minDie + maxDie) / 2, label: ((minDie + maxDie) / 2).toString() },
                            { value: maxDie, label: String(maxDie) },
                        ]}
                    />
                </Stack>

                {/* dieY */}
                <Stack gap={6}>
                    <Group justify="space-between" align="center">
                        <Text size="sm" c="dimmed">Die Y</Text>
                        <NumberInput
                            size="xs"
                            w={120}
                            value={dieY}
                            step={stepDie}
                            min={minDie}
                            max={maxDie}
                            disabled={sizeControlsDisabled}
                            onChange={onDieYChange}
                            onBlur={onDieYBlur}
                            onKeyDown={onDieYKeyDown}
                            decimalScale={6}
                            clampBehavior="strict"
                            suffix=" mm"
                        />
                    </Group>
                    <Slider
                        min={minDie}
                        max={maxDie}
                        step={stepDie}
                        value={dieY}
                        disabled={sizeControlsDisabled}
                        onChange={setDieY}
                        onChangeEnd={(val) => persistSize(dieX, val)}
                        marks={[
                            { value: minDie, label: String(minDie) },
                            { value: (minDie + maxDie) / 2, label: ((minDie + maxDie) / 2).toString() },
                            { value: maxDie, label: String(maxDie) },
                        ]}
                    />
                </Stack>

                <Group grow>
                    <Tooltip label="仅重置滑块/输入值，不修改数据库" withArrow>
                        <Button variant="light" onClick={handleResetSize} disabled={sizeControlsDisabled} leftSection={<IconEraser size={16} />}>
                            重置
                        </Button>
                    </Tooltip>
                    <Tooltip label="保存当前尺寸到数据库" withArrow>
                        <Button variant="filled" color="blue" onClick={() => persistSize()} loading={savingSize} disabled={loadingSize} leftSection={<IconDeviceFloppy size={16} />}>
                            保存
                        </Button>
                    </Tooltip>
                    <Tooltip label={dbHasSize ? '删除该产品的尺寸记录' : '没有可删除的记录'} withArrow>
                        <Button variant="light" color="red" onClick={handleDeleteSize} disabled={sizeControlsDisabled || !dbHasSize} leftSection={<IconTrash size={16} />}>
                            删除
                        </Button>
                    </Tooltip>
                </Group>

                <Divider my="xs" />

                {/* ---------------------- Offsets ---------------------- */}
                <Group justify="space-between" align="center">
                    <Title order={5}>位置偏移 (mm)</Title>
                    {loadingOffset ? (
                        <Group gap={6}>
                            <Loader size="xs" />
                            <Text size="xs" c="dimmed">加载中</Text>
                        </Group>
                    ) : (
                        <Group gap={6}>
                            <IconDatabase size={16} />
                            <Text size="xs" c={dbHasOffset ? 'teal' : 'dimmed'}>
                                {dbHasOffset ? '已有记录' : '未保存'}
                            </Text>
                        </Group>
                    )}
                </Group>

                {/* X 偏移 */}
                <Stack gap={6}>
                    <Group justify="space-between" align="center">
                        <Text size="sm" c="dimmed">X 偏移</Text>
                        <NumberInput
                            size="xs"
                            w={120}
                            value={xOffset}
                            step={stepOff}
                            min={minOff}
                            max={maxOff}
                            disabled={offsetControlsDisabled}
                            onChange={onXOffInputChange}
                            onBlur={onXOffBlur}
                            onKeyDown={onXOffKeyDown}
                            decimalScale={6}
                            clampBehavior="strict"
                            suffix=" mm"
                        />
                    </Group>
                    <Slider
                        min={minOff}
                        max={maxOff}
                        step={stepOff}
                        value={xOffset}
                        disabled={offsetControlsDisabled}
                        onChange={setXOffset}
                        onChangeEnd={(val) => persistOffsets(val, yOffset)}
                        marks={[
                            { value: minOff, label: String(minOff) },
                            { value: 0, label: '0' },
                            { value: maxOff, label: String(maxOff) },
                        ]}
                    />
                </Stack>

                {/* Y 偏移 */}
                <Stack gap={6}>
                    <Group justify="space-between" align="center">
                        <Text size="sm" c="dimmed">Y 偏移</Text>
                        <NumberInput
                            size="xs"
                            w={120}
                            value={yOffset}
                            step={stepOff}
                            min={minOff}
                            max={maxOff}
                            disabled={offsetControlsDisabled}
                            onChange={onYOffInputChange}
                            onBlur={onYOffBlur}
                            onKeyDown={onYOffKeyDown}
                            decimalScale={6}
                            clampBehavior="strict"
                            suffix=" mm"
                        />
                    </Group>
                    <Slider
                        min={minOff}
                        max={maxOff}
                        step={stepOff}
                        value={yOffset}
                        disabled={offsetControlsDisabled}
                        onChange={setYOffset}
                        onChangeEnd={(val) => persistOffsets(xOffset, val)}
                        marks={[
                            { value: minOff, label: String(minOff) },
                            { value: 0, label: '0' },
                            { value: maxOff, label: String(maxOff) },
                        ]}
                    />
                </Stack>

                <Group grow>
                    <Tooltip label="仅重置滑块/输入值，不修改数据库" withArrow>
                        <Button variant="light" onClick={handleResetOffset} disabled={offsetControlsDisabled} leftSection={<IconEraser size={16} />}>
                            重置
                        </Button>
                    </Tooltip>
                    <Tooltip label="保存当前偏移到数据库" withArrow>
                        <Button variant="filled" color="blue" onClick={() => persistOffsets()} loading={savingOffset} disabled={loadingOffset} leftSection={<IconDeviceFloppy size={16} />}>
                            保存
                        </Button>
                    </Tooltip>
                    <Tooltip label={dbHasOffset ? '删除该产品的偏移记录' : '没有可删除的记录'} withArrow>
                        <Button variant="light" color="red" onClick={handleDeleteOffset} disabled={offsetControlsDisabled || !dbHasOffset} leftSection={<IconTrash size={16} />}>
                            删除
                        </Button>
                    </Tooltip>
                </Group>

                <Divider my="xs" />

                {/* ---------------------- diesize offset ---------------------- */}
                <Group justify="space-between" align="center">
                    <Title order={5}>缺陷尺寸偏移 (um)</Title>
                    {loadingDefectSizeOffset ? (
                        <Group gap={6}>
                            <Loader size="xs" />
                            <Text size="xs" c="dimmed">加载中</Text>
                        </Group>
                    ) : (
                        <Group gap={6}>
                            <IconDatabase size={16} />
                            <Text size="xs" c={dbHasDefectSizeOffset ? 'teal' : 'dimmed'}>
                                {dbHasDefectSizeOffset ? '已有记录' : '未保存'}
                            </Text>
                        </Group>
                    )}
                </Group>
                {/* X 偏移 */}
                <Stack gap={6}>
                    <Group justify="space-between" align="center">
                        <Text size="sm" c="dimmed">X 偏移</Text>
                        <NumberInput
                            size="xs"
                            w={120}
                            value={defectSizeOffsetX}
                            step={stepDefectSizeOffset}
                            min={minDefectSizeOffset}
                            max={maxDefectSizeOffset}
                            disabled={defectOffsetControlsDisabled}
                            onChange={onDefectXOffInputChange}
                            onBlur={onDefectXOffBlur}
                            onKeyDown={onDefectXOffKeyDown}
                            decimalScale={6}
                            clampBehavior="strict"
                            suffix=" um"
                        />
                    </Group>
                    <Slider
                        min={minDefectSizeOffset}
                        max={maxDefectSizeOffset}
                        step={stepDefectSizeOffset}
                        value={defectSizeOffsetX}
                        disabled={defectOffsetControlsDisabled}
                        onChange={setDefectSizeOffsetX}
                        onChangeEnd={(val) => persistDefectSizeOffsets(val, defectSizeOffsetY)}
                        marks={[
                            { value: minDefectSizeOffset, label: String(minDefectSizeOffset) },
                            { value: 0, label: '0' },
                            { value: maxDefectSizeOffset, label: String(maxDefectSizeOffset) },
                        ]}
                    />
                </Stack>

                {/* Y 偏移 */}
                <Stack gap={6}>
                    <Group justify="space-between" align="center">
                        <Text size="sm" c="dimmed">Y 偏移</Text>
                        <NumberInput
                            size="xs"
                            w={120}
                            value={defectSizeOffsetY}
                            step={stepDefectSizeOffset}
                            min={minDefectSizeOffset}
                            max={maxDefectSizeOffset}
                            disabled={defectOffsetControlsDisabled}
                            onChange={onDefectYOffInputChange}
                            onBlur={onDefectYOffBlur}
                            onKeyDown={onDefectYOffKeyDown}
                            decimalScale={6}
                            clampBehavior="strict"
                            suffix=" um"
                        />
                    </Group>
                    <Slider
                        min={minDefectSizeOffset}
                        max={maxDefectSizeOffset}
                        step={stepDefectSizeOffset}
                        value={defectSizeOffsetY}
                        disabled={defectOffsetControlsDisabled}
                        onChange={setDefectSizeOffsetY}
                        onChangeEnd={(val) => persistDefectSizeOffsets(defectSizeOffsetX, val)}
                        marks={[
                            { value: minDefectSizeOffset, label: String(minDefectSizeOffset) },
                            { value: 0, label: '0' },
                            { value: maxDefectSizeOffset, label: String(maxDefectSizeOffset) },
                        ]}
                    />
                </Stack>

                <Group grow>
                    <Tooltip label="仅重置滑块/输入值，不修改数据库" withArrow>
                        <Button variant="light" onClick={handleResetDefectSizeOffset} disabled={defectOffsetControlsDisabled} leftSection={<IconEraser size={16} />}>
                            重置
                        </Button>
                    </Tooltip>
                    <Tooltip label="保存当前偏移到数据库" withArrow>
                        <Button variant="filled" color="blue" onClick={() => persistDefectSizeOffsets()} loading={savingDefectSizeOffset} disabled={loadingDefectSizeOffset} leftSection={<IconDeviceFloppy size={16} />}>
                            保存
                        </Button>
                    </Tooltip>
                    <Tooltip label={dbHasDefectSizeOffset ? '删除该产品的偏移记录' : '没有可删除的记录'} withArrow>
                        <Button variant="light" color="red" onClick={handleDeleteDefectSizeOffset} disabled={defectOffsetControlsDisabled || !dbHasDefectSizeOffset} leftSection={<IconTrash size={16} />}>
                            删除
                        </Button>
                    </Tooltip>
                </Group>
            </Stack>
        </Box>
    );
}
