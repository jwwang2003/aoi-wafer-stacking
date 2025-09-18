import { ExcelMetadata, WaferFileMetadata } from '@/types/wafer';
import { Card, Group, Stack, Text, Badge, Tooltip, ActionIcon, CopyButton, Kbd } from '@mantine/core';
import { IconCopy, IconCheck, IconClock, IconFileText, IconHash, IconTag, IconFolderOpen } from '@tabler/icons-react';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useMemo } from 'react';

// ===== Small utils =====
function basename(p: string) {
    if (!p) return '';
    const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return i >= 0 ? p.slice(i + 1) : p;
}
function Muted({ children }: { children: React.ReactNode }) {
    return (
        <Text
            size="xs"
            c="dimmed"
            style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}
        >
            {children}
        </Text>
    );
}

function ShowInFolderButton({ path }: { path: string }) {
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = async (e) => {
        e.stopPropagation();
        try {
            await revealItemInDir(path);          // reveal in OS file manager
        } catch (err) {
            console.error(err);
            // Fallback: try opening the path (may open file/dir, not highlight)
            try { await open(path); } catch (e2) {
                console.warn('Failed to reveal/open path via Tauri opener:', e2);
            }
        }
    };

    return (
        <Tooltip label="在文件夹中显示" withArrow>
            <ActionIcon size="sm" variant="light" color="gray" onClick={handleClick}>
                <IconFolderOpen size={14} />
            </ActionIcon>
        </Tooltip>
    );
}

export function ExcelMetadataCard({
    data,
    selected = false,
    onClick,
}: {
    data: ExcelMetadata;
    selected?: boolean;
    onClick?: () => void;
}) {
    const fileName = useMemo(() => basename(data.filePath), [data.filePath]);

    return (
        <Card
            withBorder
            radius="md"
            padding="sm"
            onClick={onClick}
            style={{
                cursor: onClick ? 'pointer' : undefined,
                borderColor: selected ? 'var(--mantine-color-blue-5)' : undefined,
                boxShadow: selected ? '0 0 0 1px var(--mantine-color-blue-5) inset' : undefined,
            }}
        >
            {/* Header row */}
            <Group justify="space-between" align="flex-start" mb={4}>
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6}>
                        <IconFileText size={16} />
                        <Text
                            fw={500}
                            size="sm"
                            style={{ lineHeight: 1.1, overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}
                        >
                            {fileName || '未知文件'}
                        </Text>
                    </Group>
                    <Muted>{data.filePath}</Muted>
                </Stack>

                <Stack gap={6} align="flex-end" style={{ flexShrink: 0 }}>
                    <Group gap={6}>
                        <Badge color="teal" variant="light" size="xs">{String(data.stage).toUpperCase()}</Badge>
                        <Badge color="blue" variant="light" size="xs">{String(data.type).toUpperCase()}</Badge>
                    </Group>

                    <Group gap="xs">
                        <ShowInFolderButton path={data.filePath} />
                        <CopyPathButton path={data.filePath} />
                    </Group>
                </Stack>
            </Group>

            {/* Body */}
            <Group gap="xs" wrap="wrap">
                {data.oem && <Pill icon={<IconTag size={12} />} label="OEM" value={data.oem} />}
                {data.id && <Pill icon={<IconHash size={12} />} label="ID" value={data.id} />}
                {data.time && <Pill icon={<IconClock size={12} />} label="时间" value={data.time} />}
            </Group>
        </Card>
    );
}

export function WaferFileMetadataCard({
    data,
    selected = false,
    onClick,
}: {
    data: WaferFileMetadata;
    selected?: boolean;
    onClick?: () => void;
}) {
    const fileName = useMemo(() => basename(data.filePath), [data.filePath]);

    return (
        <Card
            withBorder
            radius="md"
            padding="sm"
            onClick={onClick}
            style={{
                cursor: onClick ? 'pointer' : undefined,
                borderColor: selected ? 'var(--mantine-color-blue-5)' : undefined,
                boxShadow: selected ? '0 0 0 1px var(--mantine-color-blue-5) inset' : undefined,
            }}
        >
            {/* Header */}
            <Group justify="space-between" align="flex-start" mb={4}>
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6}>
                        <IconFileText size={16} />
                        <Text
                            fw={500}
                            size="sm"
                            style={{ lineHeight: 1.1, overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}
                        >
                            {fileName || '未知文件'}
                        </Text>
                    </Group>
                    <Muted>{data.filePath}</Muted>
                </Stack>

                <Stack gap={6} align="flex-end" style={{ flexShrink: 0 }}>
                    <Group gap="xs">
                        <Badge color="teal" variant="light" size="xs">{String(data.stage).toUpperCase()}</Badge>
                        <ShowInFolderButton path={data.filePath} />
                        <CopyPathButton path={data.filePath} />
                    </Group>
                </Stack>
            </Group>

            {/* Key facts */}
            <Group gap={8} wrap="wrap" mb={6}>
                <Key kv="产品" v={data.productModel} />
                <Key kv="批次" v={data.batch} />
                <Key kv="晶圆" v={data.waferId} />
                {typeof data.processSubStage === 'number' && <Key kv="子工序" v={String(data.processSubStage)} />}
                {typeof data.retestCount === 'number' && <Key kv="复测" v={String(data.retestCount)} />}
                {data.time && <Key kv="时间" v={data.time} />}
            </Group>
        </Card>
    );
}

function Key({ kv, v }: { kv: string; v?: string }) {
    return (
        <Group gap={6} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6, padding: '2px 6px' }}>
            <Text size="xs" c="dimmed">{kv}</Text>
            <Kbd style={{ fontSize: 10 }}>{v ?? '—'}</Kbd>
        </Group>
    );
}

function Pill({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: string }) {
    return (
        <Tooltip label={`${label}: ${value ?? '—'}`} withArrow>
            <Badge variant="outline" size="xs" leftSection={icon} pl={icon ? 6 : 8}>
                <Text size="xs">{value ?? '—'}</Text>
            </Badge>
        </Tooltip>
    );
}

function CopyPathButton({ path }: { path: string }) {
    return (
        <CopyButton value={path} timeout={1200}>
            {({ copied, copy }) => (
                <Tooltip label={copied ? '已复制' : '复制路径'} withArrow>
                    <ActionIcon
                        size="sm"
                        variant={copied ? 'filled' : 'light'}
                        color={copied ? 'teal' : 'gray'}
                        onClick={(e) => { e.stopPropagation(); copy(); }}
                    >
                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    );
}
