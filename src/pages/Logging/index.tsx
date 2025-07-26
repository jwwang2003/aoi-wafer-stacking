import { useEffect, useState } from 'react';
import { Box, Title, ScrollArea, Text, Divider } from '@mantine/core';

export default function LoggingPage() {
    const [logs, setLogs] = useState<string[]>([]);

    // Simulate logs for demo purposes
    useEffect(() => {
        const interval = setInterval(() => {
            setLogs((prev) => [
                ...prev,
                `[${new Date().toLocaleTimeString()}] 系统运行正常。`,
            ]);
        }, 2000);

        return () => clearInterval(interval);
    }, []);

    return (
        <Box p="md" style={{ height: '100%' }}>
            <Title order={3}>日志消息</Title>
            <Divider my="sm" />
            <ScrollArea style={{ height: '85%' }} scrollHideDelay={0}>
                {logs.map((log, index) => (
                    <Text key={index} size="sm" color="dimmed" mb={4}>
                        {log}
                    </Text>
                ))}
            </ScrollArea>
        </Box>
    );
}