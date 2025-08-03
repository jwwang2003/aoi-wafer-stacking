import {
    Container,
    Group,
    Stack,
    SegmentedControl,
    Title,
    Button,
} from '@mantine/core';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';

// Sub-pages
import Preferences from './Preferences';
import DataConfig from './DataConfig';
import SubstrateConfig from './SubstrateConfig';
import { FlowStepper } from '@/components';
import { useAppSelector } from '@/hooks';
import { DataSourceFlowSteps } from '@/flows';
import Preview from './Preview';

const subpageOptions = [
    { label: '通用', value: 'preferences' },
    { label: '数据源', value: 'data' },
    { label: '预览', value: 'db-preview' },
    { label: '衬底', value: 'substrate' },
];

export default function ConfigPage() {
    const navigate = useNavigate();
    const location = useLocation();

    // Determine current segment based on pathname
    const currentValue =
        subpageOptions.find((opt) =>
            location.pathname.endsWith(opt.value)
        )?.value ?? 'data';

    // Handle segmented control change
    const handleChange = (value: string) => {
        navigate(`/config/${value}`);
    };

    // Stepper
    const flowStep = useAppSelector((state) => state.preferences.stepper);

    return (
        <Group grow>
            <Container fluid p="md">
                <Stack gap="md">
                    <Title order={1}>设置</Title>
                    <FlowStepper active={flowStep} onStepClick={() => { }} steps={DataSourceFlowSteps}>
                        <></>
                    </FlowStepper>
                    <Button variant="outline" onClick={() => {}}>
                        验证
                    </Button>
                    <SegmentedControl
                        data={subpageOptions}
                        value={currentValue}
                        onChange={handleChange}
                    />
                    <Routes>
                        <Route path="/" element={<Navigate to="data" replace />} />
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