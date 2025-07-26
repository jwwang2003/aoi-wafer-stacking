import {
    Container,
    Group,
    Stack,
    SegmentedControl,
    Title,
} from '@mantine/core';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';

// Subpages
import Preferences from './Preferences';
import DataConfig from './DataConfig';
import SubstrateConfig from './SubstrateConfig';

const subpageOptions = [
    { label: '通用', value: 'preferences' },
    { label: '数据源', value: 'data' },
    { label: '衬底设置', value: 'substrate' },
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

    return (
        <Group grow>
            <Container fluid p="md">
                <Stack gap="md">
                    <Title order={1}>设置</Title>
                    <SegmentedControl
                        data={subpageOptions}
                        value={currentValue}
                        onChange={handleChange}
                    />
                    <Routes>
                        <Route path="/" element={<Navigate to="data" replace />} />
                        <Route path="preferences" element={<Preferences />} />
                        <Route path="data" element={<DataConfig />} />
                        <Route path="substrate" element={<SubstrateConfig />} />
                        <Route path="*" element={<div>未找到子页面</div>} />
                    </Routes>
                </Stack>
            </Container>
        </Group>
    );
}