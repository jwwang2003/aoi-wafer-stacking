import { Box, Title, Text, List, Anchor, Group, Divider } from '@mantine/core';
import { IconExternalLink, IconBrandGithub } from '@tabler/icons-react';
import pkg from '../../../package.json';

export default function AboutPage() {
  return (
    <Box p="md" style={{ maxWidth: 720, marginInline: 'auto' }}>
      <Title order={2} mb="md">
        {'About AOI Wafer Overlay (AOI优化与叠图)'}
      </Title>

      <Text mb="xs" c="dimmed">
        Version {pkg.version}
      </Text>

      <Text mb="lg">
        Wafer Overlay by Sichain is a desktop application built with Tauri V2, React, and TypeScript, designed for accurate 3D drawing and stacking of wafer data. It combines a Rust backend with a modern React-based frontend to deliver a fast, lightweight, and native experience, and now includes AOI TorchScript inference (segmentation first, optional YOLO detection) alongside intelligent wafer stacking.
      </Text>

      <Divider mb="lg" />

      <Title order={4} mb="sm">
        Development Stack
      </Title>
      <List mb="lg">
        <List.Item>
          <Anchor href="https://v2.tauri.app/start/" target="_blank" rel="noopener noreferrer">
            Tauri V2 <IconExternalLink size={14} style={{ marginLeft: 6 }} />
          </Anchor>{' '}
          - Native app framework (Rust + WebView)
        </List.Item>
        <List.Item>
          <Anchor href="https://mantine.dev/" target="_blank" rel="noopener noreferrer">
            Mantine <IconExternalLink size={14} style={{ marginLeft: 6 }} />
          </Anchor>{' '}
          - React component library for UI
        </List.Item>
        <List.Item>
          <Anchor href="https://threejs.org/" target="_blank" rel="noopener noreferrer">
            Three.js <IconExternalLink size={14} style={{ marginLeft: 6 }} />
          </Anchor>{' '}
          - 3D graphics for wafer visualization
        </List.Item>
        <List.Item>Rust Backend - High-performance core logic</List.Item>
      </List>

      <Title order={4} mb="sm">
        Authors & Contact
      </Title>
      <List>
        <List.Item>
          <Group>
            <Text size="sm">Jun Wei Wang</Text>
            <Anchor href="https://github.com/jwwang2003" target="_blank" rel="noopener noreferrer">
              <Group gap={4}>
                <IconBrandGithub size={16} />
                <Text size="sm">@jwwang2003</Text>
              </Group>
            </Anchor>
          </Group>
        </List.Item>
        <List.Item>
          <Group>
            <Text size="sm">Chen Yi Ting</Text>
            <Anchor href="https://github.com/ee731" target="_blank" rel="noopener noreferrer">
              <Group gap={4}>
                <IconBrandGithub size={16} />
                <Text size="sm">@ee731</Text>
              </Group>
            </Anchor>
          </Group>
        </List.Item>
      </List>
    </Box>
  );
}
