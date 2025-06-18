import React, { useState } from 'react';
import { Box, TextInput, Button, Group, Title, Text } from '@mantine/core';
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
    // TODO: persist `rootPath`
    console.log('Saving root folder:', rootPath);
  };

  return (
    <Box p="md" sx={{ maxWidth: 600 }}>
      <Title order={3} mb="md">Configuration</Title>

      <TextInput
        label="Root Folder"
        placeholder="Select or type a folder path"
        value={rootPath}
        onChange={handleInputChange}
        error={error}
        rightSection={
          <Button
            onClick={selectFolder}
            compact
            variant="outline"
            leftIcon={<IconFolder size={16} />}
          >
            Browse
          </Button>
        }
        sx={{ input: { paddingRight: 100 } }}
      />

      <Group position="right" mt="lg">
        <Button onClick={saveConfig} disabled={!rootPath}>
          Save
        </Button>
      </Group>

      {error && (
        <Text color="red" size="sm" mt="sm">
          {error}
        </Text>
      )}
    </Box>
  );
}
