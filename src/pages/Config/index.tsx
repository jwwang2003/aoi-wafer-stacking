import {
    Container,
    Group,
    Stack,
    SegmentedControl,
    Title,
    Button,
    Text,
    Alert,
} from '@mantine/core';
import {
    Routes,
    Route,
    useNavigate,
    useLocation,
    Navigate,
} from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';

import Preferences from './Preferences';
import DataConfig from './DataConfig';
// import SubstrateConfig from "./SubstrateConfig"; // 搬家了
import MetadataIngest from './MetadataIngest';

import { initDataSourceConfig, revalidateDataSource } from '@/slices/dataSourceConfigSlice';
import { initPreferences, revalidatePreferencesFile } from '@/slices/preferencesSlice';
import ComingSoon from '../ComingSoon';
import { initDataSourceState } from '@/slices/dataSourceStateSlice';

const subpageOptions = [
    { label: '通用', value: 'preferences' },
    { label: '数据源', value: 'data' },
    { label: '预览', value: 'metadata-ingest' },
];

export default function ConfigPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch<AppDispatch>();
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const currentValue =
        subpageOptions.find((opt) => location.pathname.endsWith(opt.value))
            ?.value ?? 'preferences';

    const handleChange = (value: string) => {
        navigate(`/config/${value}`);
    };

    const handleBootstrap = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError(null);
            await dispatch(initPreferences()).unwrap();
            await dispatch(initDataSourceConfig()).unwrap();
            await dispatch(initDataSourceState()).unwrap();
            await dispatch(revalidatePreferencesFile()).unwrap();
            await dispatch(revalidateDataSource()).unwrap();
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [dispatch]);

    useEffect(() => {
        handleBootstrap();
    }, [handleBootstrap]);

    return (
        <Group grow>
            <Container fluid p="md">
                <Stack gap="md">
                    <Title order={1}>设置</Title>

                    <Group>
                        <Button loading={loading} variant="outline" onClick={handleBootstrap}>
                            重新加载配置
                        </Button>
                        <Text size="sm" c="dimmed">顺序: 加载通用设置 → 数据源配置 → 子目录状态</Text>
                    </Group>

                    {loadError && (
                        <Alert color="red" title="加载失败">
                            {loadError}
                        </Alert>
                    )}

                    <SegmentedControl
                        autoFocus
                        data={subpageOptions}
                        value={currentValue}
                        onChange={handleChange}
                        disabled={loading}
                    />

                    <Routes>
                        <Route path="/" element={<Navigate to="preferences" replace />} />
                        <Route path="preferences" element={<Preferences />} />
                        <Route path="data" element={<DataConfig />} />
                        <Route path="metadata-ingest" element={<MetadataIngest />} />
                        <Route path="*" element={<ComingSoon />} />
                    </Routes>
                </Stack>
            </Container>
        </Group>
    );
}
