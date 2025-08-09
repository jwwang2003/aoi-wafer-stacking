import { useAppDispatch, useAppSelector } from '@/hooks';
import { setOffsets } from '@/slices/preferencesSlice';
import { OffsetConfig } from '@/types/Preferences';
import {
    Group,
    NumberInput,
    Slider,
    Stack,
    Text,
    Title,
    Box,
    Flex,
} from '@mantine/core';

// Stubbed ThreeJS Canvas
function SubstrateThreeView({
    // xOffset,
    // yOffset,
    // leftOffset,
    // rightOffset,
    // topOffset,
    // bottomOffset,
    // scale,
    // warp,
}: OffsetConfig) {
    return (
        <Box
            style={{
                background: '#111',
                color: '#fff',
                height: '600px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
            }}
        >
            <Text>Three.js 渲染区域 (Live View)</Text>
        </Box>
    );
}

export default function SubstrateConfigPage() {
    const dispatch = useAppDispatch();
    const offset = useAppSelector((state) => state.preferences.offsets);

    const updateOffset = async (key: keyof OffsetConfig, value: number) => {
        await dispatch(setOffsets({ [key]: value }));
    };

    const renderControl = (
        label: string,
        key: keyof OffsetConfig,
        min: number,
        max: number,
        step: number
    ) => (
        <Group align="center">
            <NumberInput
                label={label}
                value={offset[key] || 0}
                onChange={(val) => updateOffset(key, Number(val))}
                min={min}
                max={max}
                step={step}
                w={120}
            />
            <Slider
                value={offset[key] || 0}
                onChange={(val) => updateOffset(key, val)}
                min={min}
                max={max}
                step={step}
                style={{ flex: 1 }}
            />
        </Group>
    );

    return (
        <Flex gap="lg" align="flex-start" justify="space-between">
            {/* Left Panel: Controls */}
            <Stack w="50%" gap="md">
                <Title order={2}>衬底配置</Title>
                <Text>在此处调整衬底的偏移量、缩放和扭曲强度。</Text>

                {renderControl('X 偏移量', 'xOffset', -100, 100, 1)}
                {renderControl('Y 偏移量', 'yOffset', -100, 100, 1)}
                {renderControl('左侧偏移', 'leftOffset', -100, 100, 1)}
                {renderControl('右侧偏移', 'rightOffset', -100, 100, 1)}
                {renderControl('顶部偏移', 'topOffset', -100, 100, 1)}
                {renderControl('底部偏移', 'bottomOffset', -100, 100, 1)}
                {renderControl('缩放 (Scale)', 'scale', 0.1, 10, 0.1)}
                {renderControl('扭曲 (Warp)', 'warp', -100, 100, 1)}

                <Text size="sm" c="dimmed" mt="xs">
                    所有更改都会自动保存，无需手动操作。
                </Text>
            </Stack>

            {/* Right Panel: Three.js Canvas */}
            <Box w="50%">
                <SubstrateThreeView {...offset} />
            </Box>
        </Flex>
    );
}