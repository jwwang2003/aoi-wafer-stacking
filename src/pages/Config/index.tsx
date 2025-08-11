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
import SubstrateConfig from './SubstrateConfig';
import Preview from './Preview';

import { FlowStepper } from '@/components';
import { DataSourceFlowSteps } from '@/flows';
import { ConfigStepperState } from '@/types/Stepper';

import { fetchWaferMetadata } from '@/slices/waferMetadataSlice';
import { initDataSourceConfig } from '@/slices/dataSourceConfigSlice';
import { initPreferences } from '@/slices/preferencesSlice';
import { initDataSourceState } from '@/slices/dataSourceStateSlice';

const subpageOptions = [
    { label: '通用', value: 'preferences' },
    { label: '数据源', value: 'data' },
    { label: '预览', value: 'db-preview' },
    { label: '衬底', value: 'substrate' },
];

export default function ConfigPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch<AppDispatch>();
    const [mounted, setMounted] = useState<boolean>(false);

    const { rootPath } = useAppSelector((s) => s.dataSourceConfig);
    const flowStep = useAppSelector((s) => s.preferences.stepper);

    // figure out which segment is active
    const currentValue =
        subpageOptions.find((opt) => location.pathname.endsWith(opt.value))
            ?.value ?? 'preferences';

    const handleChange = (value: string) => {
        navigate(`/config/${value}`);
    };

    useEffect(() => {
        if (!mounted) setMounted(true);
    }, []);

    // This runs automatically when flowStep or rootPath changes
    useEffect(() => {
        const doAction = async () => {
            switch (flowStep) {
                case ConfigStepperState.Metadata:
                    await dispatch(fetchWaferMetadata());
                    break;
            }
        };
        if (mounted && rootPath) {
            doAction();
        }
    }, [mounted, flowStep, rootPath]);

    // “运行全部” handler: run both thunks, then bump the refreshKey
    const handleRunAll = async () => {
        await dispatch(initPreferences());
        await dispatch(initDataSourceConfig());
        await dispatch(initDataSourceState());
        // await dispatch(fetchWaferMetadata());
        // force remount of every subpage component
        // setRefreshKey((k) => k + 1);
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
                        运行全部
                    </Button>

                    <SegmentedControl
                        data={subpageOptions}
                        value={currentValue}
                        onChange={handleChange}
                    />

                    <Routes>
                        <Route path="/" element={<Navigate to="preferences" replace />} />
                        <Route path="preferences" element={<Preferences />} />
                        <Route path="data" element={<DataConfig />} />
                        <Route path="db-preview" element={<Preview />} />
                        <Route path="substrate" element={<SubstrateConfig />} />
                        <Route path="*" element={<div>未找到子页面</div>} />
                    </Routes>
                </Stack>
            </Container>
        </Group>
    );
}
