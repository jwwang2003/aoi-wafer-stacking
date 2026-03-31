import { Box, Title, Text, List, Anchor, Group, Divider } from '@mantine/core';
import { IconExternalLink, IconBrandGithub } from '@tabler/icons-react';
import pkg from '@/../package.json';

export default function AboutPage() {
  return (
    <Box p="md" style={{ maxWidth: 720, marginInline: 'auto' }}>
      <Title order={2} mb="md">
        {'About AOI Wafer Stacking (AOI优化与叠图)'}
      </Title>

      <Text mb="xs" c="dimmed">
        Version {pkg.version}
      </Text>

      <Text mb="lg">
        AOI Wafer Stacking is a Sichain desktop application for intelligent wafer map viewing, automatic multi-stage stacking, and in-app AOI inference. It blends a Rust backend with a React/Mantine front end to stay lightweight while handling TorchScript segmentation (with optional YOLO detection), 3D wafer rendering, and export of stacked results for downstream analysis.
      </Text>

      <Divider mb="lg" />

      <Title order={4} mb="sm">
        Key Capabilities
      </Title>
      <List mb="lg" spacing="xs">
        <List.Item>Auto-detects CP / WLBI / AOI folders with regex defaults and allows manual override.</List.Item>
        <List.Item>Reads .txt, .xls/.xlsx, and .WaferMap inputs; normalizes into internal map structures.</List.Item>
        <List.Item>Stacks multiple stages into unified map exports (mapEx, wafermap, hexmap) plus JPG snapshots.</List.Item>
        <List.Item>Runs embedded TorchScript for AOI segmentation; YOLO detection can be toggled.</List.Item>
        <List.Item>Ships with environment-based admin password seeding (`VITE_ADMIN_DEFAULT_PASSWORD`).</List.Item>
      </List>

      <Title order={4} mb="sm">
        Data & Outputs
      </Title>
      <List mb="lg" spacing="xs">
        <List.Item>Folder naming patterns for stage discovery: 衬底, FAB CP, CP 1, WLBI MAP, CP 2, AOI.</List.Item>
        <List.Item>Supports notch direction, die metrics, and bin statistics per map; retains special markers (e.g., `*`, `S`).</List.Item>
        <List.Item>Output folder naming: `型号_批次号_叠图序号`; file naming: `型号_批次号_片号.ext`.</List.Item>
        <List.Item>Database lives in `%APPDATA%/data.db`; defaults to `admin` unless overridden via env.</List.Item>
      </List>

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
