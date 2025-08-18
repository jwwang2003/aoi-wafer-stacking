import {
    Container,
    Group,
    Stack,
    SegmentedControl,
    Title,
    Button,
} from '@mantine/core';
import {
    Routes,
    Route,
    useNavigate,
    useLocation,
    Navigate,
} from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';
import { useAppSelector } from '@/hooks';

import Preferences from './Preferences';
import DataConfig from './DataConfig';
// import SubstrateConfig from "./SubstrateConfig"; // 搬家了
import MetadataIngest from './MetadataIngest';

import { FlowStepper } from '@/components';
import { DataSourceFlowSteps } from '@/flows';

import { initDataSourceConfig, scanDataSourceFolders } from '@/slices/dataSourceConfigSlice';
import { initPreferences } from '@/slices/preferencesSlice';
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
    const [mounted, setMounted] = useState<boolean>(false);

    const flowStep = useAppSelector((s) => s.preferences.stepper);

    const currentValue =
        subpageOptions.find((opt) => location.pathname.endsWith(opt.value))
            ?.value ?? 'preferences';

    const handleChange = (value: string) => {
        navigate(`/config/${value}`);
    };

    useEffect(() => {
        if (!mounted) setMounted(true);
    }, [mounted]);

    const handleRunAll = async () => {
        await dispatch(initPreferences());
        await dispatch(initDataSourceConfig());
        await dispatch(scanDataSourceFolders());
        await dispatch(initDataSourceState());
    };

    return (
        <Group grow>
            <Container fluid p="md">
                <Stack gap="md">
                    <Title order={1}>设置</Title>

                    <FlowStepper
                        active={flowStep}
                        onStepClick={() => { }}
                        steps={DataSourceFlowSteps}
                    >
                        <></>
                    </FlowStepper>

                    <Button variant="outline" onClick={handleRunAll}>
                        {'RUN (1~3)'}
                    </Button>

                    <SegmentedControl
                        autoFocus
                        data={subpageOptions}
                        value={currentValue}
                        onChange={handleChange}
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
