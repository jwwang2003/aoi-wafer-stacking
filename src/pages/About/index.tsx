// @ts-nocheck

import { Box, Title, Text, List, Anchor, Group } from '@mantine/core';

export default function AboutPage() {
  return (
    <Box p="md" sx={{ maxWidth: 600 }}>
      <Title order={2} mb="md">
        About Wafer Overlay (智能叠图)
      </Title>

      <Text mb="lg">
        Wafer Overlay is a desktop application built with Tauri V2, React, and TypeScript, designed for accurate 3D drawing and stacking of wafer data. It combines a Rust backend with a modern React-based frontend to deliver a fast and native experience.
      </Text>

      <Title order={4} mb="sm">
        Development Stack
      </Title>
      <List mb="lg">
        <List.Item>
          <Anchor href="https://v2.tauri.app/start/" target="_blank">
            Tauri V2
          </Anchor> - Native app framework (Rust + Webview)
        </List.Item>
        <List.Item>
          <Anchor href="https://mantine.dev/" target="_blank">
            Mantine
          </Anchor> - React component library for UI
        </List.Item>
        <List.Item>
          <Anchor href="https://threejs.org/" target="_blank">
            Three.js
          </Anchor> - 3D graphics for wafer visualization
        </List.Item>
        <List.Item>Rust Backend - High-performance core logic</List.Item>
      </List>

      <Title order={4} mb="sm">
        Authors & Contact
      </Title>
      <List>
        <List.Item>
          <Group spacing="xs">
            <Text weight={500}>JUN WEI WANG</Text>
            <Anchor href="https://github.com/jwwang2003" target="_blank">
              @jwwang2003
            </Anchor>
          </Group>
        </List.Item>
        <List.Item>
          <Group spacing="xs">
            <Text weight={500}>YI TING</Text>
            <Anchor href="https://github.com/ee731" target="_blank">
              @ee731
            </Anchor>
          </Group>
        </List.Item>
      </List>
    </Box>
  );
}
