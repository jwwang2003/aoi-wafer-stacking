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

import { initDataSourceConfig } from '@/slices/dataSourceConfigSlice';
import { initPreferences } from '@/slices/preferencesSlice';
import { initDataSourceState } from '@/slices/dataSourceStateSlice';
import ComingSoon from '../ComingSoon';

const subpageOptions = [
    { label: '通用', value: 'preferences' },
    { label: '数据源', value: 'data' },
    { label: '预览', value: 'metadata-ingest' },
    // { label: "衬底", value: "substrate" },
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

    // Ctrl/Cmd + ← / → to move between subpages
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // ignore when typing in inputs/textareas/contenteditable
            const target = e.target as HTMLElement | null;
            const isEditable =
                !!target &&
                (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    (target as HTMLElement).isContentEditable ||
                    target.getAttribute('role') === 'textbox'
                );

            if (isEditable) return;

            const isModifier = e.ctrlKey || e.metaKey; // Ctrl on Windows/Linux, Cmd on macOS
            if (!isModifier) return;

            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const idx = subpageOptions.findIndex((opt) =>
                    location.pathname.endsWith(opt.value)
                );
                const safeIdx = idx === -1 ? 0 : idx;

                let nextIdx = safeIdx;
                if (e.key === 'ArrowLeft') {
                    nextIdx = Math.max(0, safeIdx - 1); // clamp at first
                } else {
                    nextIdx = Math.min(subpageOptions.length - 1, safeIdx + 1); // clamp at last
                }

                if (nextIdx !== safeIdx) {
                    navigate(`/config/${subpageOptions[nextIdx].value}`);
                }
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [location.pathname, navigate]);
    
    const handleRunAll = async () => {
        await dispatch(initPreferences());
        await dispatch(initDataSourceConfig());
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
                        <Route path="metadata-ingest" element={<MetadataIngest />} />
                        {/* <Route path="substrate" element={<SubstrateConfig />} /> */}
                        <Route path="*" element={<ComingSoon />} />
                    </Routes>
                </Stack>
            </Container>
        </Group>
    );
}
