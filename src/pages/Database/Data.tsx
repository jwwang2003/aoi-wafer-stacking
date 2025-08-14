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

const subpageOptions = [
    { label: '产品信息', value: 'product' },
];

export default function DatabaseIndexPage() {
    const navigate = useNavigate();
    const location = useLocation();

    // figure out which segment is active
    const currentValue = useMemo(() => {
        const match = subpageOptions.find((opt) => location.pathname.endsWith(opt.value));
        return match?.value ?? 'oem';
    }, [location.pathname]);

    const handleChange = (value: string) => {
        navigate(`/db/data/${value}`);
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
                        <Route path="/" element={<Navigate to="oem" replace />} />
                        <Route path="product" element={<>Test1</>} />
                    </Routes>
                </Stack>
            </Container>
        </Group>
    );
}


function ProductSubPage() {
    return (
        <>
        </>
    )
}