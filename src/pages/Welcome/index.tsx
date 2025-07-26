import { Container, Title, Text, Button, Stack, Center, Group } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

export default function WelcomePage() {
    return (
        <Container size="md" h="100vh">
            <Center h="100%">
                <Stack align="center">
                    <IconSparkles size={64} stroke={1.5} />
                    <Title order={1} ta="center">
                        欢迎使用《清纯AOI优化与叠图》
                    </Title>
                    <Text size="lg" c="dimmed" ta="center" maw={520}>
                        本系统集成了自动光学检测（AOI）优化与晶圆叠图功能，支持图层选择、缺陷可视化及工艺路径配置，助您高效分析与追踪良率问题。
                    </Text>
                    <Group>
                        <Button
                            component={Link}
                            to="/config"
                            variant="filled"
                            size="md"
                            radius="xl"
                        >
                            立即开始
                        </Button>
                        <Button
                            component={Link}
                            to="/help"
                            variant="outline"
                            size="md"
                            radius="xl"
                        >
                            查看使用手册
                        </Button>
                    </Group>
                </Stack>
            </Center>
        </Container>
    );
}