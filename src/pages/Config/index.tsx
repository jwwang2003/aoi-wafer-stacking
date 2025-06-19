import React, { useState } from 'react';
import { Box, TextInput, Button, Group, Title, Text, Stack, Container } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { setRootPath } from '@/slices/configSlice';

export default function ConfigPage() {
    const dispatch = useAppDispatch();
    const rootPath = useAppSelector((state) => state.config.rootPath);
    const [error, setError] = useState<string | null>(null);

    const selectFolder = async () => {
        try {
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Select Root Folder',
        });
        if (typeof selected === 'string') {
            dispatch(setRootPath(selected));
            setError(null);
        }
        } catch (e: any) {
        setError(`Failed to select folder: ${e.message}`);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        dispatch(setRootPath(e.currentTarget.value));
        setError(null);
    };

    const saveConfig = () => {
        if (!rootPath) {
        setError('Please select or enter a valid folder path.');
        return;
        }
        console.log('Saving root folder:', rootPath);
    };

    const inputProps = (label: string) => ({
        label,
        placeholder: '选择或输入一个目录',
        value: rootPath,
        onChange: handleInputChange,
        error,
        rightSection: (
        <Button
            onClick={selectFolder}
            style={{
            width: "100%",
            height: "100%",
            padding: 0
            }}
            compact
            // variant="outline"
        >
            <IconFolder size={16} strokeWidth={2}/>
        </Button>
        ),
        sx: { input: { paddingRight: 100 } },
    });

    return (
        <Box p="md">
            <Stack gap="md">
                <Title order={1}>配置</Title>
                    <TextInput {...inputProps('根目录')} />
                    <TextInput {...inputProps('衬底路径')} />
                    <TextInput {...inputProps('FAB CP路径')} />
                    <TextInput {...inputProps('CP1路径')} />
                    <TextInput {...inputProps('WLBI路径')} />
                    <TextInput {...inputProps('CP2路径')} />
                    <TextInput {...inputProps('AOI路径')} />
                <Group position="right">
                    <Button onClick={saveConfig} disabled={!rootPath}>
                    保存
                    </Button>
                </Group>

                {error && (
                    <Text color="red" size="sm">
                    {error}
                    </Text>
                )}
            </Stack>
        </Box>
    );
}
