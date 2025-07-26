import { useState } from 'react';
import { Button, Group, NumberInput, Slider, Stack, Text, Title, Box, Flex } from '@mantine/core';

// Stub ThreeJS Canvas (replace this with actual rendering logic)
function SubstrateThreeView({
    xOffset,
    yOffset,
    leftOffset,
    rightOffset,
    topOffset,
    bottomOffset,
    scale,
    warp,
}: {
    xOffset: number;
    yOffset: number;
    leftOffset: number;
    rightOffset: number;
    topOffset: number;
    bottomOffset: number;
    scale: number;
    warp: number;
}) {
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
    const [xOffset, setXOffset] = useState<number>(0);
    const [yOffset, setYOffset] = useState<number>(0);
    const [leftOffset, setLeftOffset] = useState<number>(0);
    const [rightOffset, setRightOffset] = useState<number>(0);
    const [topOffset, setTopOffset] = useState<number>(0);
    const [bottomOffset, setBottomOffset] = useState<number>(0);
    const [scale, setScale] = useState<number>(1);
    const [warp, setWarp] = useState<number>(0);

    const handleSave = () => {
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

    const renderControl = (
        label: string,
        value: number,
        setValue: (val: number) => void,
        min: number,
        max: number,
        step: number
    ) => (
        <Group align="center">
            <NumberInput
                label={label}
                value={value}
                onChange={(val) => setValue(Number(val))}
                min={min}
                max={max}
                step={step}
                w={120}
            />
            <Slider
                value={value}
                onChange={(val) => setValue(val)}
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

                {renderControl('X 偏移量', xOffset, setXOffset, -100, 100, 1)}
                {renderControl('Y 偏移量', yOffset, setYOffset, -100, 100, 1)}
                {renderControl('左侧偏移', leftOffset, setLeftOffset, -100, 100, 1)}
                {renderControl('右侧偏移', rightOffset, setRightOffset, -100, 100, 1)}
                {renderControl('顶部偏移', topOffset, setTopOffset, -100, 100, 1)}
                {renderControl('底部偏移', bottomOffset, setBottomOffset, -100, 100, 1)}
                {/* {renderControl('缩放 (Scale)', scale, setScale, 0.1, 10, 0.1)}
                {renderControl('扭曲 (Warp)', warp, setWarp, -100, 100, 1)} */}

                <Button onClick={handleSave}>保存配置</Button>
                <Group >
                    <Button onClick={handleSave}>导出配置</Button>
                    <Button onClick={handleSave}>导入配置</Button>
                </Group>
            </Stack>

            {/* Right Panel: Three.js Canvas */}
            <Box w="50%">
                <SubstrateThreeView
                    xOffset={xOffset}
                    yOffset={yOffset}
                    leftOffset={leftOffset}
                    rightOffset={rightOffset}
                    topOffset={topOffset}
                    bottomOffset={bottomOffset}
                    scale={scale}
                    warp={warp}
                />
            </Box>
        </Flex>
    );
}