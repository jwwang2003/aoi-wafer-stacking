import RotatingDisk from '@/components/RotatingDisk';
import WaferScene from '@/WaferScene';
import { Box, Title, Text, List, Anchor, Group, Container } from '@mantine/core';

export default function WaferStacking() {
  return (
    <Box p="md">
      <Title order={2} mb="md">
        {'晶圆叠图 (Wafer Stacking)'}
      </Title>
      <Container mb="md">

        <RotatingDisk textureUrl="./demo.png" />
      </Container>
    </Box>
  );
}