import { useState, useMemo, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
    Box,
    Title,
    Divider,
    Button,
    Group,
    Pagination,
    Text,
    Chip
} from '@mantine/core';
import { Console } from 'console-feed';
import { RootState } from '@/store';
import { Message } from 'console-feed/lib/definitions/Component';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { Log } from '@/types/log';

type Methods =
    | 'log'
    | 'debug'
    | 'info'
    | 'warn'
    | 'error'
    | 'table'
    | 'clear'
    | 'time'
    | 'timeEnd'
    | 'count'
    | 'assert';

const LOGS_PER_PAGE = 100;
const METHOD_OPTIONS: Methods[] = [
    'log', 'debug', 'info', 'warn', 'error', 'table', 'clear', 'time', 'timeEnd', 'count', 'assert',
];

export default function LoggingPage() {
    const logs = useSelector((state: RootState) => state.log.logs);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedMethods, setSelectedMethods] = useState<Methods[]>(() => {
        try {
            const raw = localStorage.getItem('logging-selectedMethods');
            return raw ? (JSON.parse(raw) as Methods[]) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem('logging-selectedMethods', JSON.stringify(selectedMethods));
    }, [selectedMethods]);

    const reversedLogs = useMemo(() => [...logs].reverse(), [logs]);

    const totalPages = Math.max(1, Math.ceil(reversedLogs.length / LOGS_PER_PAGE));

    const pagedLogs = useMemo(() => {
        const start = (currentPage - 1) * LOGS_PER_PAGE;
        return reversedLogs.slice(start, start + LOGS_PER_PAGE);
    }, [reversedLogs, currentPage]);

    async function downloadLogFile(reversedLogs: Log[]) {
        try {
            const content = reversedLogs
                .map((log) => `[${log.date}] ${log.method.toUpperCase()}: ${JSON.stringify(log.data)}`)
                .join('\n');

            // Open save dialog for user to choose destination
            const timestamp = new Date().toISOString().replace(/[:]/g, '-'); // e.g. 2025-08-06T15-35-22.123Z
            const filename = `${timestamp}_export.log`;

            const destPath = await save({
                defaultPath: filename,
                filters: [{ name: 'Log Files', extensions: ['log'] }],
            });

            if (destPath) {
                await writeTextFile(destPath, content);
                console.info('Log file saved to:', destPath);
            } else {
                console.info('Save cancelled by user');
            }
        } catch (err) {
            console.error('Error saving log file:', err);
        }
    }

    return (
        <Box p="md" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Title order={3}>日志消息</Title>
            <Divider my="sm" />

            <Group mb="xs" justify="space-between" wrap="nowrap">
                {/* Left: Filters + Label */}
                <Group align="center">
                    <Text size="xs" c="dimmed" fw={500}>
                        筛选条件
                    </Text>
                    <Chip.Group
                        multiple
                        value={selectedMethods}
                        onChange={(methods) => {
                            setCurrentPage(1); // Reset page on filter change
                            setSelectedMethods(methods as Methods[]);
                        }}
                    >
                        <Group gap="xs" wrap="wrap">
                            {METHOD_OPTIONS.map((method) => (
                                <Chip key={method} value={method} size="xs" radius="sm">
                                    {method.toUpperCase()}
                                </Chip>
                            ))}
                        </Group>
                    </Chip.Group>
                </Group>
            </Group>

            <Group justify="space-between" mb="xs">
                <Pagination
                    value={currentPage}
                    onChange={setCurrentPage}
                    total={totalPages}
                    size="sm"
                />
                <Text size="xs" c="dimmed">
                    日志按时间倒序排列（最新在上）
                </Text>
            </Group>

            <Box style={{ flex: 1, overflow: 'auto' }}>
                <Console
                    logs={pagedLogs as Message[]}
                    filter={selectedMethods.length > 0 ? selectedMethods : undefined}
                    variant="light"
                />
            </Box>

            <Group justify="space-between" wrap="nowrap">
                <Text mt="xs" size="xs" c="dimmed">
                    共 {reversedLogs.length} 条日志，当前第 {currentPage} 页 / 共 {totalPages} 页
                </Text>
                {/* Right: Save button */}
                <Button size="xs" onClick={() => downloadLogFile(reversedLogs)}>
                    下载日志文件
                </Button>
            </Group>
        </Box>
    );
}
