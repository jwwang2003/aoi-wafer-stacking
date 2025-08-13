import { useMemo } from 'react';
import { Card, Badge, Group, Title, Divider } from '@mantine/core';
import { useAppSelector } from '@/hooks';
import { DataSourcePaths } from '@/types/DataSource';
import { initialDataSourceState } from '@/constants/default';

export default function RawWaferSummary() {
    const rawData = useAppSelector((state) => state.waferMetadata.data);

    const total = rawData.length;
    const stages = Object.keys(initialDataSourceState) as (keyof DataSourcePaths)[];

    const counts = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of rawData) m.set(r.stage, (m.get(r.stage) ?? 0) + 1);
        return m;
    }, [rawData]);

    const knownTotal = stages.reduce((acc, s) => acc + (counts.get(s as string) ?? 0), 0);
    const otherCount = Math.max(0, total - knownTotal);

    return (
        <Card withBorder radius="md" p="sm">
            <Group justify="space-between" mb="xs">
                <Title order={5}>原始文件数据源总览</Title>
                <Badge size="sm" color="blue">{total}</Badge>
            </Group>

            <Divider my="xs" />

            <Group wrap="wrap" gap="xs">
                {stages.map((stage) => (
                    <Badge key={stage} color="teal" variant="light">
                        {String(stage).toUpperCase()}: {counts.get(stage as string) ?? 0}
                    </Badge>
                ))}
                <Badge color="gray" variant="light">其他: {otherCount}</Badge>
            </Group>
        </Card>
    );
}
