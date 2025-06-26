import { useState } from 'react';
import { Button, Group, NumberInput, Slider, Stack, Text, Title } from '@mantine/core';

export default function SubstrateConfigPage() {
    // Offset and transformation states
    const [xOffset, setXOffset] = useState<number>(0);
    const [yOffset, setYOffset] = useState<number>(0);
    const [leftOffset, setLeftOffset] = useState<number>(0);
    const [rightOffset, setRightOffset] = useState<number>(0);
    const [topOffset, setTopOffset] = useState<number>(0);
    const [bottomOffset, setBottomOffset] = useState<number>(0);
    const [scale, setScale] = useState<number>(1);
    const [warp, setWarp] = useState<number>(0);

    const handleSave = () => {
        // Replace this with actual dispatch or persistence logic
        console.log('保存衬底配置：', {
            xOffset,
            yOffset,
            leftOffset,
            rightOffset,
            topOffset,
            bottomOffset,
            scale,
            warp,
        });
    };

    // Render a paired NumberInput + Slider for each parameter
    return (
        <Stack gap="md">
            <Title order={2}>衬底配置</Title>
            <Text>在此处调整衬底的偏移量、缩放和扭曲强度。</Text>

            {/* X Offset */}
            <Group align="center">
                <NumberInput
                    label="X 偏移量"
                    value={xOffset}
                    onChange={(val) => setXOffset(val || 0)}
                    min={-100}
                    max={100}
                    step={1}
                />
                <Slider
                    value={xOffset}
                    onChange={(val) => setXOffset(val)}
                    min={-100}
                    max={100}
                    step={1}
                    style={{ flex: 1 }}
                />
            </Group>

            {/* Y Offset */}
            <Group align="center">
                <NumberInput
                    label="Y 偏移量"
                    value={yOffset}
                    onChange={(val) => setYOffset(val || 0)}
                    min={-100}
                    max={100}
                    step={1}
                />
                <Slider
                    value={yOffset}
                    onChange={(val) => setYOffset(val)}
                    min={-100}
                    max={100}
                    step={1}
                    style={{ flex: 1 }}
                />
            </Group>

            {/* Rectangle Side Offsets */}
            <Group align="center">
                <NumberInput
                    label="左侧偏移"
                    value={leftOffset}
                    onChange={(val) => setLeftOffset(val || 0)}
                    min={-100}
                    max={100}
                    step={1}
                />
                <Slider
                    value={leftOffset}
                    onChange={(val) => setLeftOffset(val)}
                    min={-100}
                    max={100}
                    step={1}
                    style={{ flex: 1 }}
                />
            </Group>
            <Group align="center">
                <NumberInput
                    label="右侧偏移"
                    value={rightOffset}
                    onChange={(val) => setRightOffset(Number(val) || 0)}
                    min={-100}
                    max={100}
                    step={1}
                />
                <Slider
                    value={rightOffset}
                    onChange={(val) => setRightOffset(val)}
                    min={-100}
                    max={100}
                    step={1}
                    style={{ flex: 1 }}
                />
            </Group>
            <Group align="center">
                <NumberInput
                    label="顶部偏移"
                    value={topOffset}
                    onChange={(val) => setTopOffset(val || 0)}
                    min={-100}
                    max={100}
                    step={1}
                />
                <Slider
                    value={topOffset}
                    onChange={(val) => setTopOffset(val)}
                    min={-100}
                    max={100}
                    step={1}
                    style={{ flex: 1 }}
                />
            </Group>
            <Group align="center">
                <NumberInput
                    label="底部偏移"
                    value={bottomOffset}
                    onChange={(val) => setBottomOffset(val || 0)}
                    min={-100}
                    max={100}
                    step={1}
                />
                <Slider
                    value={bottomOffset}
                    onChange={(val) => setBottomOffset(val)}
                    min={-100}
                    max={100}
                    step={1}
                    style={{ flex: 1 }}
                />
            </Group>

            {/* Scale */}
            <Group align="center">
                <NumberInput
                    label="缩放 (Scale)"
                    value={scale}
                    onChange={(val) => setScale(val || 1)}
                    min={0.1}
                    max={10}
                    step={0.1}
                />
                <Slider
                    value={scale}
                    onChange={(val) => setScale(val)}
                    min={0.1}
                    max={10}
                    step={0.1}
                    style={{ flex: 1 }}
                />
            </Group>

            <Button onClick={handleSave}>保存配置</Button>
        </Stack>
    );
}