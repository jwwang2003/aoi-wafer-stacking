import { useEffect, useState } from 'react';
import {
    Table, TextInput, Title, ScrollArea,
    Stack, Button, Group, Tooltip, NumberInput,
    Select, Divider
} from '@mantine/core';
import { IconLoader } from '@tabler/icons-react';
// import { open } from '@tauri-apps/plugin-dialog';
import Database from '@tauri-apps/plugin-sql';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';
import { fetchWaferMetadata } from '@/slices/waferMetadataSlice';

interface OverlayRecord {
    product_id: string;
    batch_id: string;
    wafer_id: number;
    stage: string;
    sub_stage: string | null;
    retest_count: number;
    file_path: string;
    last_mtime: number;
}

export default function Preview() {
    const dispatch = useDispatch<AppDispatch>();

    const [db, setDb] = useState<Database | null>(null);
    const [data, setData] = useState<OverlayRecord[]>([]);

    const [waferId, setWaferId] = useState('');
    const [stage, setStage] = useState('');
    const [retryMin, setRetryMin] = useState<number | ''>('');
    const [retryMax, setRetryMax] = useState<number | ''>('');
    const [loading, setLoading] = useState(false);

    // Init DB connection on first load
    useEffect(() => {
        const connectDB = async () => {
            const db = await Database.load('sqlite:data.db');
            setDb(db);
        };
        connectDB();
    }, []);

    const fetchData = async () => {
        if (!db) return;
        setLoading(true);
        try {
            // Dynamically build SQL with placeholders
            let sql = 'SELECT * FROM wafer_maps WHERE 1=1';
            const params: (string | number)[] = [];

            if (waferId) {
                sql += ' AND wafer_id = ?';
                params.push(Number(waferId));
            }

            if (stage) {
                sql += ' AND stage = ?';
                params.push(stage);
            }

            if (retryMin !== '') {
                sql += ' AND retest_count >= ?';
                params.push(retryMin);
            }

            if (retryMax !== '') {
                sql += ' AND retest_count <= ?';
                params.push(retryMax);
            }

            sql += ' ORDER BY last_mtime DESC LIMIT 100';

            const results = await db.select<OverlayRecord[]>(sql, params);
            setData(results);
        } catch (error) {
            console.error('Query failed:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (db) fetchData();
    }, [db, waferId, stage, retryMin, retryMax]);

    const load = () => {
        dispatch(fetchWaferMetadata())
            .then((result) => {
                console.log(result);
            })
            .catch((error) => {
                console.error(error);
            })
    }

    return (
        <Stack>
            <Tooltip label="加载/刷新" withArrow>
                <Button
                    variant="light"
                    color="blue"
                    leftSection={<IconLoader size={16} />}
                    loading={loading}
                    onClick={load}
                >
                    加载/刷新
                </Button>
            </Tooltip>

            <Title order={2}>叠图信息</Title>

            <Divider />

            <Title order={3}>{'浏览与索引(来自数据库)'}</Title>
            <Group grow>
                <TextInput
                    label="代工厂产品型号 (OEM)"
                    placeholder="输入 OEM ID"
                    value={waferId}
                    onChange={(e) => setWaferId(e.currentTarget.value)}
                />
                <TextInput
                    label="产品型号 (Product ID)"
                    placeholder="输入 Product ID"
                    value={waferId}
                    onChange={(e) => setWaferId(e.currentTarget.value)}
                />
                <TextInput
                    label="批次号"
                    placeholder="输入 Batch ID"
                    value={waferId}
                    onChange={(e) => setWaferId(e.currentTarget.value)}
                />
                <TextInput
                    label="片号"
                    placeholder="输入 Wafer ID"
                    value={waferId}
                    onChange={(e) => setWaferId(e.currentTarget.value)}
                />
                <Select
                    label="工艺阶段"
                    placeholder="选择 Stage"
                    data={['任意', 'CP1', 'CP2', 'WLBI', 'AOI']}
                    value={stage}
                    onChange={(e) => e && setStage(e)}
                    clearable
                />
                <NumberInput
                    label="复测最小值"
                    placeholder="最小"
                    value={retryMin}
                    onChange={(e) => e && setRetryMin(Number(e))}
                    min={0}
                />
                <NumberInput
                    label="复测最大值"
                    placeholder="最大"
                    value={retryMax}
                    onChange={(e) => e && setRetryMax(Number(e))}
                    min={0}
                />
            </Group>

            <ScrollArea>
                <Table highlightOnHover striped>
                    <thead>
                        <tr>
                            <th>产型号</th>
                            <th>批次号</th>
                            <th>片号</th>
                            <th>阶段</th>
                            <th>子阶段</th>
                            <th>复测</th>
                            <th>最后修改</th>
                            <th>路径</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, idx) => (
                            <tr key={idx}>
                                <td>{row.product_id}</td>
                                <td>{row.batch_id}</td>
                                <td>{row.wafer_id}</td>
                                <td>{row.stage}</td>
                                <td>{row.sub_stage || '-'}</td>
                                <td>{row.retest_count}</td>
                                <td>{new Date(row.last_mtime).toLocaleString()}</td>
                                <td>{row.file_path}</td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </ScrollArea>
        </Stack>
    );
}
