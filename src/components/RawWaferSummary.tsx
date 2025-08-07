import { Accordion, Badge, Group } from '@mantine/core';
import { useAppSelector } from '@/hooks';
import { DataSourcePaths } from '@/types/DataSource';
import { initialDataSourceState } from '@/constants/default';

export default function RawWaferSummary() {
    const rawData = useAppSelector((state) => state.waferMetadata.data);
    const total = rawData.length;
    const d = initialDataSourceState;
    
    return (
        <Accordion variant="contained" defaultValue={null} chevronPosition="left">
            <Accordion.Item value="wafer-summary">
                <Accordion.Control>
                    原始文件数据源总览 <Badge size="sm" color="blue">{total}</Badge>
                </Accordion.Control>
                <Accordion.Panel>
                    <Group wrap="wrap">
                        {(Object.keys(d) as (keyof DataSourcePaths)[]).map((stage) => {
                            const count = rawData.filter((d) => d.stage === stage).length;
                            return (
                                <Badge key={stage} color="teal" variant="light">
                                    {stage.toUpperCase()}: {count}
                                </Badge>
                            );
                        })}
                        <Badge color="gray" variant="light">
                            其他: {rawData.filter((d) =>
                                !['substrate', 'cpProber', 'wlbi', 'aoi'].includes(d.stage)
                            ).length}
                        </Badge>
                    </Group>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    );
}
