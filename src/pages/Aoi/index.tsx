import type { ChangeEvent, DragEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Card,
    Divider,
    Group,
    Loader,
    NumberInput,
    Paper,
    SimpleGrid,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Select,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconCpu,
    IconBolt,
    IconPhotoPlus,
    IconPlayerPlay,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';

import type {
    AoiInferenceBatchResult,
    AoiInferenceSample,
    AoiInferenceStatus,
    AoiDetectionBox,
} from '@/types/ipc';
import { fetchAoiInferenceStatus, runAoiInference, type AoiInferenceImage } from '@/api/tauri/aoi';
import { resourceDir, join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';
import type { AoiWeightInfo } from '@/types/ipc';

interface LocalImage {
    name: string;
    size: number;
    data: Uint8Array;
    previewUrl: string;
}

const formatBytes = (size: number) => {
    if (size === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    const value = size / 1024 ** idx;
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
};

function buildMaskUrl(mask: AoiInferenceSample['mask']): string | null {
    if (!mask) return null;
    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imgData = ctx.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
        const v = mask.data[i];
        imgData.data[i * 4] = 255;      // R
        imgData.data[i * 4 + 1] = 255;  // G
        imgData.data[i * 4 + 2] = 255;  // B
        imgData.data[i * 4 + 3] = v;    // alpha channel controls transparency
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
}

function MaskOverlay({
    sample,
    files,
}: {
    sample: AoiInferenceSample;
    files: LocalImage[];
}) {
    const maskUrl = buildMaskUrl(sample.mask);
    const file = files.find(f => f.name === sample.name);
    if (!file) return <Text c="red" size="sm">找不到对应的原始图片</Text>;
    if (!maskUrl) return <Text c="red" size="sm">无可用掩膜输出</Text>;
    return (
        <Box
            style={{
                position: 'relative',
                width: '100%',
                paddingBottom: '56%',
                backgroundImage: `linear-gradient(45deg, #f8fafc 25%, transparent 25%), linear-gradient(-45deg, #f8fafc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f8fafc 75%), linear-gradient(-45deg, transparent 75%, #f8fafc 75%)`,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                borderRadius: 8,
                overflow: 'hidden',
            }}
        >
            <Box
                style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `url(${file.previewUrl})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    maskImage: `url(${maskUrl})`,
                    WebkitMaskImage: `url(${maskUrl})`,
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                }}
            />
        </Box>
    );
}

function DetectionOverlay({
    sample,
    files,
}: {
    sample: AoiInferenceSample;
    files: LocalImage[];
}) {
    const file = files.find(f => f.name === sample.name);
    const boxes = sample.detection?.boxes || [];
    if (!file) return <Text c="red" size="sm">找不到对应的原始图片</Text>;
    if (boxes.length === 0) return <Text c="dimmed" size="sm">无检测结果</Text>;
    return (
        <Box style={{ position: 'relative', width: '100%', paddingBottom: '56%', background: '#f8fafc', borderRadius: 8, overflow: 'hidden' }}>
            <img
                src={file.previewUrl}
                alt={sample.name}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
            />
            {boxes.map((b: AoiDetectionBox, idx: number) => {
                const w = sample.width || 1;
                const h = sample.height || 1;
                const left = (b.x1 / w) * 100;
                const top = (b.y1 / h) * 100;
                const bw = ((b.x2 - b.x1) / w) * 100;
                const bh = ((b.y2 - b.y1) / h) * 100;
                return (
                    <Box
                        key={idx}
                        style={{
                            position: 'absolute',
                            border: '2px solid #22c55e',
                            borderRadius: 6,
                            left: `${left}%`,
                            top: `${top}%`,
                            width: `${bw}%`,
                            height: `${bh}%`,
                            pointerEvents: 'none',
                            boxShadow: '0 0 0 1px rgba(34,197,94,0.4)',
                        }}
                    >
                        <Box
                            style={{
                                position: 'absolute',
                                top: -18,
                                left: -2,
                                background: 'rgba(34,197,94,0.9)',
                                color: 'white',
                                padding: '0 6px',
                                fontSize: 12,
                                borderRadius: 4,
                            }}
                        >
                            {`cls ${b.classId} | ${(b.score * 100).toFixed(1)}%`}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}

export default function AoiPage() {
    const [status, setStatus] = useState<AoiInferenceStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [files, setFiles] = useState<LocalImage[]>([]);
    const filesRef = useRef<LocalImage[]>([]);
    const [preferGpu, setPreferGpu] = useState(true);
    const [cpuWeightPath, setCpuWeightPath] = useState('');
    const [gpuWeightPath, setGpuWeightPath] = useState('');
    const [previewCount, setPreviewCount] = useState<number>(12);
    const [resizeEnabled, setResizeEnabled] = useState(false);
    const [resizeWidth, setResizeWidth] = useState<number>(256);
    const [resizeHeight, setResizeHeight] = useState<number>(256);
    const [maskThreshold, setMaskThreshold] = useState(0.5);
    const [detectEnabled, setDetectEnabled] = useState(true);
    const [detectPreferGpu, setDetectPreferGpu] = useState(true);
    const [detectWeightPath, setDetectWeightPath] = useState('');
    const [detectThreshold, setDetectThreshold] = useState(0.25);
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | null>(null);
    const [result, setResult] = useState<AoiInferenceBatchResult | null>(null);
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const defaultPathResolved = useRef(false);
    const [fallbackWeights, setFallbackWeights] = useState<AoiWeightInfo[]>([]);

    const refreshStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const next = await fetchAoiInferenceStatus();
            setStatus(next);
            if (next.weights.cpuPath && !cpuWeightPath) setCpuWeightPath(next.weights.cpuPath);
            if (next.weights.gpuPath && !gpuWeightPath) setGpuWeightPath(next.weights.gpuPath);
            setPreferGpu(next.device.preferGpu);
        } catch (err) {
            console.error(err);
        } finally {
            setStatusLoading(false);
        }
    }, [cpuWeightPath, gpuWeightPath]);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    // In production, resolve bundled weights inside the app Resources dir when the backend
    // status doesn't report paths (e.g., when running from a DMG or installed .app).
    useEffect(() => {
        if (defaultPathResolved.current) return;
        const resolveDefaults = async () => {
            try {
                const resDir = await resourceDir();
                const candidates: Array<{ path: string; device: string; model: string; format: string; extension: string }> = [
                    { path: await join(resDir, 'assets', 'models', 'aoi_cpu.ts'), device: 'cpu', model: 'AOI', format: 'torchscript', extension: 'ts' },
                    { path: await join(resDir, 'assets', 'models', 'aoi_gpu.ts'), device: 'gpu', model: 'AOI', format: 'torchscript', extension: 'ts' },
                    { path: await join(resDir, 'assets', 'models', 'yolo_detect.ts'), device: 'gpu', model: 'YOLO', format: 'torchscript', extension: 'ts' },
                ];

                const existing: AoiWeightInfo[] = [];
                for (const c of candidates) {
                    if (await exists(c.path)) {
                        existing.push({
                            model: c.model,
                            device: c.device,
                            format: c.format,
                            path: c.path,
                            extension: c.extension,
                        });
                    }
                }

                if (!cpuWeightPath && existing.find(w => w.device === 'cpu')) {
                    setCpuWeightPath(existing.find(w => w.device === 'cpu')!.path);
                }
                if (!gpuWeightPath && existing.find(w => w.device === 'gpu' && w.model === 'AOI')) {
                    setGpuWeightPath(existing.find(w => w.device === 'gpu' && w.model === 'AOI')!.path);
                }
                if (!detectWeightPath && existing.find(w => w.model.toLowerCase().includes('yolo'))) {
                    setDetectWeightPath(existing.find(w => w.model.toLowerCase().includes('yolo'))!.path);
                }
                if (existing.length > 0) setFallbackWeights(existing);
                defaultPathResolved.current = true;
            } catch (err) {
                console.warn('Failed to resolve bundled weight paths', err);
            }
        };
        resolveDefaults();
    }, [cpuWeightPath, gpuWeightPath, detectWeightPath]);

    useEffect(() => {
        filesRef.current = files;
    }, [files]);

    useEffect(() => () => {
        filesRef.current.forEach(f => URL.revokeObjectURL(f.previewUrl));
    }, []);

    const addFiles = useCallback(async (list: FileList | File[]) => {
        const incoming = Array.from(list).filter(f => f.type.startsWith('image/'));
        const converted: LocalImage[] = [];
        for (const file of incoming) {
            const buf = await file.arrayBuffer();
            converted.push({
                name: file.name,
                size: file.size,
                data: new Uint8Array(buf),
                previewUrl: URL.createObjectURL(file),
            });
        }
        setFiles(prev => [...prev, ...converted]);
    }, []);

    const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) {
            await addFiles(e.dataTransfer.files);
        }
    }, [addFiles]);

    const handleFileInput = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            await addFiles(e.target.files);
            e.target.value = '';
        }
    }, [addFiles]);

    const runInference = useCallback(async () => {
        if (files.length === 0) return;
        setRunning(true);
        setRunError(null);
        setResult(null);
        try {
            const payload: AoiInferenceImage[] = files.map(f => ({
                name: f.name,
                data: f.data,
            }));
            const response = await runAoiInference({
                images: payload,
                preferGpu,
                cpuWeightPath: cpuWeightPath || undefined,
                gpuWeightPath: gpuWeightPath || undefined,
                previewValues: previewCount,
                resize: resizeEnabled ? { width: resizeWidth, height: resizeHeight } : undefined,
                maskThreshold,
                detectEnabled,
                detectPreferGpu,
                detectWeightPath: detectWeightPath || undefined,
                detectThreshold,
            });
            setResult(response);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setRunError(message);
        } finally {
            setRunning(false);
        }
    }, [cpuWeightPath, files, gpuWeightPath, preferGpu, previewCount]);

    const removeFile = useCallback((name: string) => {
        setFiles(prev => {
            const remaining = prev.filter(f => f.name !== name);
            const removed = prev.find(f => f.name === name);
            if (removed) URL.revokeObjectURL(removed.previewUrl);
            return remaining;
        });
    }, []);

    const clearFiles = useCallback(() => {
        setFiles(prev => {
            prev.forEach(f => URL.revokeObjectURL(f.previewUrl));
            return [];
        });
    }, []);

    const gpuBadge = useMemo(() => {
        if (!status) return null;
        if (status.device.gpuAvailable) {
            return (
                <Badge color="teal" leftSection={<IconBolt size={14} />}>
                    GPU 可用 ({status.device.gpuCount})
                </Badge>
            );
        }
        return (
            <Badge color="gray" leftSection={<IconCpu size={14} />}>
                GPU 不可用，使用 CPU
            </Badge>
        );
    }, [status]);

    const totalSize = useMemo(
        () => files.reduce((acc, file) => acc + file.size, 0),
        [files]
    );

    const hasWeights = useMemo(() => {
        if (!status) return null;
        const combined = [...(status.weights.available || []), ...fallbackWeights];
        const cpuOk = Boolean(status.weights.cpuPath || combined.find(w => w.device.toLowerCase().includes('cpu')));
        const gpuOk = Boolean(status.weights.gpuPath || combined.find(w => w.device.toLowerCase().includes('gpu')));
        return (
            <Group gap="xs">
                <Badge color={cpuOk ? 'teal' : 'yellow'}>
                    CPU 模型 {cpuOk ? '已找到' : '缺失'}
                </Badge>
                <Badge color={gpuOk ? 'teal' : 'yellow'}>
                    GPU 模型 {gpuOk ? '已找到' : '缺失'}
                </Badge>
            </Group>
        );
    }, [status]);

    const summary = useMemo(() => {
        if (!result) return null;
        const ok = result.results.length;
        const failed = result.errors.length;
        return (
            <Group gap="xs">
                <Badge color="teal">成功 {ok}</Badge>
                {failed > 0 && <Badge color="red">失败 {failed}</Badge>}
                <Badge color="blue">设备 {result.backend.device}</Badge>
            </Group>
        );
    }, [result]);

    const cpuOptions = useMemo(() => {
        const seen = new Set<string>();
        const weights = [...(status?.weights.available || []), ...fallbackWeights].filter(w => {
            if (seen.has(w.path)) return false;
            seen.add(w.path);
            return true;
        });
        return weights
            .filter(w => w.device.toLowerCase().includes('cpu'))
            .map(w => ({ value: w.path, label: `${w.model} | ${w.device} | ${w.format} (${w.extension})` }));
    }, [status]);

    const gpuOptions = useMemo(() => {
        const seen = new Set<string>();
        const weights = [...(status?.weights.available || []), ...fallbackWeights].filter(w => {
            if (seen.has(w.path)) return false;
            seen.add(w.path);
            return true;
        });
        return weights
            .filter(w => w.device.toLowerCase().includes('gpu') || w.device.toLowerCase().includes('inference'))
            .map(w => ({ value: w.path, label: `${w.model} | ${w.device} | ${w.format} (${w.extension})` }));
    }, [status]);

    const yoloOptions = useMemo(() => {
        const seen = new Set<string>();
        const weights = [...(status?.weights.available || []), ...fallbackWeights].filter(w => {
            if (seen.has(w.path)) return false;
            seen.add(w.path);
            return true;
        });
        return weights
            .filter(w => w.model.toLowerCase().includes("yolo"))
            .map(w => ({ value: w.path, label: `${w.model} | ${w.device} | ${w.format} (${w.extension})` }));
    }, [status]);

    const libtorchDisabled = status ? !status.libtorchEnabled : false;

    return (
        <Stack p="md" gap="lg">
            <Group justify="space-between" align="flex-start">
                <div>
                    <Title order={2}>AOI TorchScript Demo</Title>
                    <Text c="dimmed" size="sm">
                        下方拖放图片，Rust 后端使用 tch + TorchScript 权重进行推理，自动检测 GPU（有则优先）。
                    </Text>
                    <Group mt="sm" gap="xs">
                        {gpuBadge}
                        {hasWeights}
                        {statusLoading && <Loader size="sm" />}
                    </Group>
                </div>
                <Group gap="xs">
                    <Switch
                        checked={preferGpu}
                        onChange={e => setPreferGpu(e.currentTarget.checked)}
                        label="优先使用 GPU"
                        disabled={!status?.device.gpuAvailable}
                    />
                    <ActionIcon variant="light" onClick={refreshStatus} aria-label="刷新状态">
                        <IconRefresh size={16} />
                    </ActionIcon>
                </Group>
            </Group>

            {libtorchDisabled && (
                <Card withBorder radius="md" p="md" bg="#fff0f0">
                    <Text c="red" fw={600}>此版本未包含 libtorch，AOI 推理已禁用。</Text>
                    <Text c="dimmed" size="sm">请使用带 libtorch 的构建或开启相应特性后重新运行。</Text>
                </Card>
            )}

            <Paper
                radius="md"
                p="lg"
                withBorder
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                style={{
                    borderStyle: 'dashed',
                    borderColor: dragging ? '#14b8a6' : '#e9ecef',
                    background: dragging ? 'rgba(20,184,166,0.08)' : 'transparent',
                }}
            >
                <Stack align="center" gap="sm">
                    <IconPhotoPlus size={32} color="#14b8a6" />
                    <Text>拖放图片到此处（PNG/JPG/BMP/TIFF），或点击下方按钮选择</Text>
                    <Group gap="sm">
                        <Button
                            leftSection={<IconPhotoPlus size={16} />}
                            onClick={() => fileInputRef.current?.click()}
                            variant="light"
                        >
                            选择图片
                        </Button>
                        <Button
                            color="teal"
                            leftSection={<IconPlayerPlay size={16} />}
                            loading={running}
                            disabled={files.length === 0 || libtorchDisabled}
                            onClick={runInference}
                        >
                            运行推理
                        </Button>
                        <Button
                            color="red"
                            variant="outline"
                            leftSection={<IconTrash size={16} />}
                            onClick={clearFiles}
                            disabled={files.length === 0}
                        >
                            清空
                        </Button>
                    </Group>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileInput}
                    />
                    <Text c="dimmed" size="sm">
                        已选 {files.length} 张 / {totalSize ? formatBytes(totalSize) : '0 B'}
                    </Text>
                </Stack>
            </Paper>

            <Card withBorder radius="md" p="md">
                <Card.Section inheritPadding py="xs">
                    <Group justify="space-between">
                        <Text fw={600}>权重路径</Text>
                        <Text c="dimmed" size="xs">可在此覆盖默认权重路径</Text>
                    </Group>
                </Card.Section>
                <Divider my="sm" />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput
                        label="CPU TorchScript (.ts)"
                        placeholder="assets/models/aoi_cpu.ts"
                        value={cpuWeightPath}
                        onChange={e => setCpuWeightPath(e.currentTarget.value)}
                        leftSection={<IconCpu size={16} />}
                    />
                    <TextInput
                        label="GPU TorchScript (.ts)"
                        placeholder="assets/models/aoi_gpu.ts"
                        value={gpuWeightPath}
                        onChange={e => setGpuWeightPath(e.currentTarget.value)}
                        leftSection={<IconBolt size={16} />}
                    />
                </SimpleGrid>
                <Group mt="sm" gap="md">
                    <NumberInput
                        label="返回的输出预览长度"
                        value={previewCount}
                        min={1}
                        max={64}
                        onChange={val => setPreviewCount(Number(val) || 1)}
                    />
                    <NumberInput
                        label="掩膜阈值 (0-1)"
                        value={maskThreshold}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={val => setMaskThreshold(
                            Math.min(1, Math.max(0, Number(val) || 0))
                        )}
                    />
                    <Select
                        label="CPU 权重"
                        placeholder="自动选择 CPU 权重"
                        data={cpuOptions}
                        clearable
                        value={cpuWeightPath || null}
                        onChange={val => setCpuWeightPath(val || '')}
                        searchable
                    />
                    <Select
                        label="GPU 权重"
                        placeholder="自动选择 GPU 权重"
                        data={gpuOptions}
                        clearable
                        value={gpuWeightPath || null}
                        onChange={val => setGpuWeightPath(val || '')}
                        searchable
                    />
                    <Select
                        label="YOLO 权重"
                        placeholder="自动选择 YOLO 权重"
                        data={yoloOptions}
                        clearable
                        value={detectWeightPath || null}
                        onChange={val => setDetectWeightPath(val || '')}
                        searchable
                    />
                    <Switch
                        label="启用检测（YOLO）"
                        checked={detectEnabled}
                        onChange={e => setDetectEnabled(e.currentTarget.checked)}
                    />
                    <Switch
                        label="YOLO 优先 GPU"
                        checked={detectPreferGpu}
                        onChange={e => setDetectPreferGpu(e.currentTarget.checked)}
                    />
                    <NumberInput
                        label="YOLO 置信度阈值"
                        value={detectThreshold}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={val => setDetectThreshold(Math.min(1, Math.max(0, Number(val) || 0)))}
                    />
                    <Switch
                        label="推理前调整尺寸"
                        checked={resizeEnabled}
                        onChange={e => setResizeEnabled(e.currentTarget.checked)}
                    />
                    <NumberInput
                        label="宽度"
                        value={resizeWidth}
                        min={1}
                        max={4096}
                        disabled={!resizeEnabled}
                        onChange={val => setResizeWidth(Number(val) || resizeWidth)}
                    />
                    <NumberInput
                        label="高度"
                        value={resizeHeight}
                        min={1}
                        max={4096}
                        disabled={!resizeEnabled}
                        onChange={val => setResizeHeight(Number(val) || resizeHeight)}
                    />
                </Group>
            </Card>

            {files.length > 0 && (
                <Card withBorder radius="md" p="md">
                    <Group justify="space-between" align="center">
                        <Text fw={600}>待推理图片</Text>
                        <Badge color="blue">{files.length} 张</Badge>
                    </Group>
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} mt="sm" spacing="sm">
                        {files.map(file => (
                            <Card key={file.name} withBorder padding="sm" radius="md">
                                <Group justify="space-between" mb="xs">
                                    <Text fw={600} size="sm" lineClamp={1}>{file.name}</Text>
                                    <ActionIcon color="red" variant="subtle" onClick={() => removeFile(file.name)} aria-label="删除图片">
                                        <IconTrash size={14} />
                                    </ActionIcon>
                                </Group>
                                <Box
                                    style={{ position: 'relative', width: '100%', paddingBottom: '56%', overflow: 'hidden', borderRadius: 8, background: '#f8fafc' }}
                                >
                                    <img
                                        src={file.previewUrl}
                                        alt={file.name}
                                        style={{ position: 'absolute', inset: 0, objectFit: 'contain', width: '100%', height: '100%' }}
                                    />
                                </Box>
                                <Text size="sm" c="dimmed" mt={6}>{formatBytes(file.size)}</Text>
                            </Card>
                        ))}
                    </SimpleGrid>
                </Card>
            )}

            {runError && (
                <Card withBorder color="red" radius="md" p="md">
                    <Group gap="xs">
                        <IconAlertTriangle size={16} color="red" />
                        <Text c="red">{runError}</Text>
                    </Group>
                </Card>
            )}

            {result && (
                <Card withBorder radius="md" p="md">
                    <Group justify="space-between" mb="sm">
                        <Text fw={600}>推理结果</Text>
                        {summary}
                    </Group>
                    <Text size="sm" c="dimmed">模型: {result.backend.modelPath}</Text>
                    <Divider my="sm" />
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                        {result.results.map((sample: AoiInferenceSample) => (
                            <Card key={sample.name} shadow="xs" padding="sm" radius="md" withBorder>
                                <Group justify="space-between">
                                    <Text fw={600}>{sample.name}</Text>
                                    <Badge color="teal">{sample.durationMs} ms</Badge>
                                </Group>
                                <Text size="sm" c="dimmed">
                                    维度: {sample.width}×{sample.height}×{sample.channels} · 设备: {sample.device}
                                </Text>
                                <Divider my="xs" />
                                <Text size="sm" fw={600}>掩膜</Text>
                                <MaskOverlay
                                    sample={sample}
                                    files={files}
                                />
                                <Divider my="xs" />
                                <Text size="sm" fw={600}>检测 (YOLO)</Text>
                                <DetectionOverlay sample={sample} files={files} />
                                <Divider my="xs" />
                                <Text size="sm" fw={600}>输出预览</Text>
                                <Text size="sm" c="dimmed">
                                    总长度 {sample.preview.totalValues}，前 {sample.preview.values.length} 个:
                                </Text>
                                <Box
                                    component="pre"
                                    style={{
                                        background: '#f8fafc',
                                        borderRadius: 8,
                                        padding: 8,
                                        fontSize: 12,
                                        overflowX: 'auto',
                                    }}
                                >
{`[${sample.preview.values.map(v => v.toFixed(4)).join(', ')}]`}
                                </Box>
                                <Text size="xs" c="dimmed">输出 shape: [{sample.preview.shape.join(', ')}]</Text>
                            </Card>
                        ))}
                    </SimpleGrid>
                    {result.errors.length > 0 && (
                        <>
                            <Divider my="sm" />
                            <Text fw={600} c="red" mb="xs">失败</Text>
                            <Stack gap="xs">
                                {result.errors.map(err => (
                                    <Group key={err.name} gap="xs">
                                        <Badge color="red">{err.name}</Badge>
                                        <Text c="red" size="sm">{err.message}</Text>
                                    </Group>
                                ))}
                            </Stack>
                        </>
                    )}
                </Card>
            )}
        </Stack>
    );
}
