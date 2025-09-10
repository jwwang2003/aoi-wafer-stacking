import { useEffect, useRef, useState } from 'react';
import { Modal, Stack, Text, Group, Button } from '@mantine/core';

type Props = {
    minWidth: number;
    title?: string;
    message?: React.ReactNode;
    hint?: React.ReactNode;
};

/**
 * Displays a reusable modal notice when the window width is below `minWidth`.
 * The modal can be dismissed; it will reappear only if the window crosses
 * the threshold back above and then below again.
 */
export default function MinWidthNotice({ minWidth, title, message, hint }: Props) {
    const [open, setOpen] = useState(false);
    const dismissedRef = useRef(false);

    useEffect(() => {
        const handle = () => {
            const w = window.innerWidth || 1;
            const below = w < minWidth;
            if (!below) {
                // Reset dismissal when width is healthy again
                dismissedRef.current = false;
                setOpen(false);
                return;
            }
            // Show if below threshold and not dismissed
            if (!dismissedRef.current) setOpen(true);
        };
        handle();
        window.addEventListener('resize', handle);
        return () => window.removeEventListener('resize', handle);
    }, [minWidth]);

    const handleClose = () => {
        dismissedRef.current = true;
        setOpen(false);
    };

    return (
        <Modal opened={open} onClose={handleClose} title={title ?? '窗口宽度不足'} centered>
            <Stack gap="xs">
                <Text>{message ?? '当前窗口宽度不足以完整显示页面内容，部分组件可能呈现不理想。'}</Text>
                <Text c="dimmed" size="sm">
                    {hint ?? (
                        <>建议最小宽度：{minWidth}px。请加宽窗口或使用更高分辨率显示器。</>
                    )}
                </Text>
                <Group justify="end">
                    <Button size="xs" onClick={handleClose}>
                        我知道了
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

