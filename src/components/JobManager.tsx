import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '@/hooks';
import { AppDispatch } from '@/store';
import {
    queueAddFromCurrent,
    queueRemoveJob,
    queueUpdateJob,
    queueSetActive,
} from '@/slices/job';
import {
    ActionIcon,
    Badge,
    Button,
    Card,
    Group,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconPlayerPlay, IconPlus, IconTrash, IconPencil, IconDeviceFloppy, IconX } from '@tabler/icons-react';

type EditState = {
    name?: string;
    note?: string;
    subId?: string;
};

export default function JobManager({ disableAddFromCurrent = false }: { disableAddFromCurrent?: boolean }) {
    const dispatch = useDispatch<AppDispatch>();
    const { queue, activeId } = useAppSelector(s => s.stackingJob);

    const [editing, setEditing] = useState<Record<string, EditState>>({});

    const hasJobs = queue.length > 0;

    const getLabel = (j: typeof queue[number]) =>
        j.name?.trim() || `${j.productId || '—'} / ${j.batchId || '—'} / ${j.waferId ?? '—'}${j.subId ? ` / ${j.subId}` : ''}`;

    const handleAddCurrent = () => {
        dispatch(queueAddFromCurrent(undefined));
    };

    const handleRemove = (id: string) => {
        dispatch(queueRemoveJob(id));
    };

    const toggleEdit = (id: string) => {
        setEditing((prev) => {
            const next = { ...prev };
            if (next[id]) delete next[id]; else {
                const base = queue.find(q => q.id === id);
                next[id] = { name: base?.name ?? '', note: base?.note ?? '', subId: base?.subId ?? '' };
            }
            return next;
        });
    };

    const handleSave = (id: string) => {
        const edits = editing[id];
        if (!edits) return;
        dispatch(queueUpdateJob({ id, changes: { name: edits.name, note: edits.note, subId: edits.subId } }));
        // If editing active job, reflect subId change to active fields
        if (id === activeId && typeof edits.subId === 'string') {
            // queueSetActive will copy all fields; simplest is to re-apply active to refresh state
            dispatch(queueSetActive(id));
        }
        setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });
    };

    const handleActivate = (id: string) => {
        dispatch(queueSetActive(id));
    };

    return (
        <Card withBorder radius="lg" p="sm" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Group justify="space-between" mb="xs">
                <Title order={4}>任务队列</Title>
                <Tooltip label="加入当前选择" withArrow>
                    <Button size="xs" leftSection={<IconPlus size={14} />} onClick={handleAddCurrent} disabled={disableAddFromCurrent}>
                        加入当前
                    </Button>
                </Tooltip>
            </Group>

            <ScrollArea.Autosize mah={{ base: 520 }} type="hover" offsetScrollbars scrollbarSize={8} style={{ flex: 1 }}>
                <Stack gap="xs">
                    {!hasJobs && (
                        <Text c="dimmed" size="sm">
                            {disableAddFromCurrent ? '暂无任务' : '暂无任务，点击“加入当前”添加。'}
                        </Text>
                    )}
                    {queue.map((j) => {
                        const isEditing = !!editing[j.id];
                        const e = editing[j.id] ?? {};
                        return (
                            <Card key={j.id} withBorder radius="md" p="xs">
                                <Stack gap={6}>
                                    <Group justify="space-between" align="center">
                                        <Group gap={8} wrap="nowrap">
                                            <Badge size="xs" variant="light" color={j.status === 'active' ? 'blue' : j.status === 'done' ? 'teal' : j.status === 'error' ? 'red' : 'gray'}>
                                                {j.status.toUpperCase()}
                                            </Badge>
                                            <Text fw={600} size="sm" lineClamp={1} style={{ maxWidth: 200 }}>{getLabel(j)}</Text>
                                        </Group>
                                        <Group gap={6}>
                                            {!isEditing && <Tooltip label="设为激活" withArrow><ActionIcon size="sm" variant="subtle" onClick={() => handleActivate(j.id)}><IconPlayerPlay size={16} /></ActionIcon></Tooltip>}
                                            <Tooltip label={isEditing ? '保存' : '编辑'} withArrow>
                                                {isEditing ? (
                                                    <ActionIcon size="sm" variant="light" color="teal" onClick={() => handleSave(j.id)}>
                                                        <IconDeviceFloppy size={16} />
                                                    </ActionIcon>
                                                ) : (
                                                    <ActionIcon size="sm" variant="subtle" onClick={() => toggleEdit(j.id)}>
                                                        <IconPencil size={16} />
                                                    </ActionIcon>
                                                )}
                                            </Tooltip>
                                            <Tooltip label={isEditing ? '取消' : '删除'} withArrow>
                                                <ActionIcon size="sm" variant={isEditing ? 'subtle' : 'light'} color={isEditing ? 'gray' : 'red'} onClick={() => isEditing ? toggleEdit(j.id) : handleRemove(j.id)}>
                                                    {isEditing ? <IconX size={16} /> : <IconTrash size={16} />}
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    </Group>
                                    {isEditing && (
                                        <Group gap={6} grow>
                                            <TextInput size="xs" label="名称" placeholder="自定义名称（可选）" value={e.name ?? ''} onChange={(ev) => setEditing(prev => ({ ...prev, [j.id]: { ...prev[j.id], name: ev.currentTarget.value } }))} />
                                            <TextInput size="xs" label="备注" placeholder="备注（可选）" value={e.note ?? ''} onChange={(ev) => setEditing(prev => ({ ...prev, [j.id]: { ...prev[j.id], note: ev.currentTarget.value } }))} />
                                            <TextInput size="xs" label="子编号" placeholder="sub_id" value={e.subId ?? ''} onChange={(ev) => setEditing(prev => ({ ...prev, [j.id]: { ...prev[j.id], subId: ev.currentTarget.value } }))} />
                                        </Group>
                                    )}
                                    <Group gap={8}>
                                        <Text size="xs" c="dimmed">{j.productId || '—'} / {j.batchId || '—'} / {j.waferId ?? '—'}</Text>
                                        {j.subId && <Badge size="xs" variant="outline">{j.subId}</Badge>}
                                    </Group>
                                </Stack>
                            </Card>
                        );
                    })}
                </Stack>
            </ScrollArea.Autosize>

            <Text size="xs" c="dimmed" mt="xs">共 {queue.length} 个任务</Text>
        </Card>
    );
}
