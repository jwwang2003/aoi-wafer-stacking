import { Container, Title, Button, Stack, Center, Group } from '@mantine/core';
import { Link } from 'react-router-dom';

export default function WelcomePage() {
    return (
        <Container size="md" h="100vh">
            <Center h="100%">
                <Stack align="center" gap="md">
                    <Group gap="md" align="center" justify="center">
                        <img
                            src="/logoB.png"
                            alt="AOI Logo"
                            style={{
                                width: 400,
                                height: 'auto',
                                maxHeight: 160,
                                objectFit: 'contain',
                                filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.12))'
                            }}
                        />
                        {/* <IconSparkles size={72} stroke={1.5} /> */}
                    </Group>
                    <Title order={1} ta="center" mt="sm">
                        欢迎使用《清纯AOI优化与叠图》
                    </Title>
                    {/* <Text size="lg" c="dimmed" ta="center" maw={520}>
                        本系统集成了自动光学检测（AOI）优化与晶圆叠图功能，支持图层选择、缺陷可视化及工艺路径配置，助您高效分析与追踪良率问题。
                    </Text> */}
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
