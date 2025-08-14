import { Container, Title, Text, Button, Stack, Group, Center } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

export default function ComingSoon() {
    return (
        <Container fluid h="100%">
            <Center h="100%">
                <Stack align="center">
                    <IconClock size={64} stroke={1.5} />
                    <Title order={1} ta="center">
                        敬请期待
                    </Title>
                    <Text c="dimmed" ta="center" size="lg" maw={400}>
                        我们正在努力开发新的功能，敬请期待更多精彩内容！
                    </Text>
                    <Group>
                        <Button
                            component={Link}
                            to="/"
                            variant="default"
                            size="md"
                            radius="xl"
                        >
                            返回首页
                        </Button>
                    </Group>
                </Stack>
            </Center>
        </Container>
    );
}
