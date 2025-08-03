import { useEffect, useState } from 'react';
import {
    Table, TextInput, Title, ScrollArea,
    Stack, Button, Group, Tooltip, NumberInput, Select,
    Divider
} from '@mantine/core';
import { IconLoader } from '@tabler/icons-react';

interface OverlayRecord {
    id: number;
    wafer_id: string;
    chip_id: string;
    process_stage: string;
    file_path: string;
    last_modified: string;
}

export default function Preview() {
    const [data, setData] = useState<OverlayRecord[]>([]);
    const [waferId, setWaferId] = useState('');
    const [chipId, setChipId] = useState('');
    const [stage, setStage] = useState('');
    const [retryMin, setRetryMin] = useState<number | ''>('');
    const [retryMax, setRetryMax] = useState<number | ''>('');
    const [loading, setLoading] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Replace with actual backend call
            // const result = await invoke<OverlayRecord[]>('query_overlay_info_advanced', {
            //     waferId,
            //     chipId,
            //     stage,
            //     retryMin,
            //     retryMax,
            // });
            // setData(result);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [waferId, chipId, stage, retryMin, retryMax]);

    return (
        <Stack>
            <Tooltip label="加载/刷新" withArrow>
                <Button
                    variant="light"
                    color="blue"
                    leftSection={<IconLoader size={16} />}
                    loading={loading}
                    onClick={fetchData}
                >
                    加载/刷新
                </Button>
            </Tooltip>

            <Title order={2}>叠图信息</Title>

            <Title order={3}>统计</Title>

            <Divider />

            <Title order={3}>浏览与索引</Title>
            <Group grow>
                <TextInput
                    label="Wafer ID"
                    placeholder="输入 Wafer ID"
                    value={waferId}
                    onChange={(e) => setWaferId(e.currentTarget.value)}
                />
                <TextInput
                    label="Chip ID"
                    placeholder="输入 Chip ID"
                    value={chipId}
                    onChange={(e) => setChipId(e.currentTarget.value)}
                />
                <Select
                    label="工艺阶段"
                    placeholder="选择 Stage"
                    data={['CP1', 'CP2', 'WLBI', 'AOI']}
                    value={stage}
                    onChange={setStage}
                    clearable
                />
                <NumberInput
                    label="复测最小值"
                    placeholder="最小"
                    value={retryMin}
                    onChange={setRetryMin}
                    min={0}
                />
                <NumberInput
                    label="复测最大值"
                    placeholder="最大"
                    value={retryMax}
                    onChange={setRetryMax}
                    min={0}
                />
            </Group>

            <ScrollArea>
                <Table highlightOnHover striped>
                    <thead>
                        <tr>
                            <th>Wafer ID</th>
                            <th>Chip ID</th>
                            <th>Stage</th>
                            <th>Path</th>
                            <th>Modified</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr key={row.id}>
                                <td>{row.wafer_id}</td>
                                <td>{row.chip_id}</td>
                                <td>{row.process_stage}</td>
                                <td>{row.file_path}</td>
                                <td>{row.last_modified}</td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </ScrollArea>
        </Stack>
    );
}