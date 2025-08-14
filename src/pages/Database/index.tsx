import {
    Container,
    Group,
    Stack,
    SegmentedControl,
    Title,
} from '@mantine/core';
import {
    Routes,
    Route,
    useNavigate,
    useLocation,
    Navigate,
} from 'react-router-dom';
import { useMemo } from 'react';

// Sub-pages
import Cache from './Cache';
import Data from './Data';
import ComingSoon from '../ComingSoon';

const subpageOptions = [
    { label: 'Wafer数据据', value: 'data' },
    { label: '缓存', value: 'cache' },
];

export default function DatabaseIndexPage() {
    const navigate = useNavigate();
    const location = useLocation();

    // figure out which segment is active
    const currentValue = useMemo(() => {
        const match = subpageOptions.find((opt) => location.pathname.endsWith(opt.value));
        return match?.value ?? 'data';
    }, [location.pathname]);

    const handleChange = (value: string) => {
        navigate(`/db/${value}`);
    };

    return (
        <Group grow>
            <Container fluid p="md">
                <Stack gap="md">
                    <Group justify="space-between" align="center">
                        <Title order={1}>数据库</Title>
                    </Group>

                    <SegmentedControl
                        data={subpageOptions}
                        value={currentValue}
                        onChange={handleChange}
                    />

                    <Routes>
                        <Route path="/" element={<Navigate to="data" replace />} />
                        <Route path="data/*" element={<Data />} />
                        <Route path="cache" element={<Cache />} />
                        <Route path="*" element={<ComingSoon />} />
                    </Routes>
                </Stack>
            </Container>
        </Group>
    );
}
