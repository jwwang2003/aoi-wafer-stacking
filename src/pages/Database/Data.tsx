import {
    Container,
    Group,
    Stack,
    SegmentedControl,
} from '@mantine/core';
import {
    Routes,
    Route,
    useNavigate,
    useLocation,
    Navigate,
} from 'react-router-dom';
import { useMemo } from 'react';
import ProductBatchNavigator from '@/components/Navigator/ProductBatch';
import ComingSoon from '../ComingSoon';

const subpageOptions = [
    { label: '快速预览', value: 'browse' },
    { label: '索引', value: 'search' },
];

export default function DatabaseIndexPage() {
    const navigate = useNavigate();
    const location = useLocation();

    // figure out which segment is active
    const currentValue = useMemo(() => {
        const match = subpageOptions.find((opt) => location.pathname.endsWith(opt.value));
        return match?.value ?? 'browse';
    }, [location.pathname]);

    const handleChange = (value: string) => {
        navigate(`/db/data/${value}`);
    };

    return (
        <Group grow>
            <Container fluid p="md">
                <Stack gap="md">
                    <SegmentedControl
                        w={"min-content"}
                        data={subpageOptions}
                        value={currentValue}
                        onChange={handleChange}
                    />

                    <Routes>
                        <Route path="/" element={<Navigate to="browse" replace />} />
                        <Route path="browse" element={<BrowsePage />} />
                        <Route path="search" element={<ComingSoon />} />
                        <Route path="*" element={<ComingSoon />} />
                    </Routes>
                </Stack>
            </Container>
        </Group>
    );
}


function BrowsePage() {
    return (
        <ProductBatchNavigator />
    )
}

// function SearchPage() {
//     return (
//         <></>
//     )
// }