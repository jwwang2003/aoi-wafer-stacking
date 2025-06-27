import { useState } from 'react';
import {
  Title,
  Group,
  Container,
  Stack,
  Switch,
  Checkbox,
  Button,
  Divider,
  Box,
  ScrollArea,
  Text,
  Paper,
} from '@mantine/core';
import ProcessRouteStepper from '@/components/ProcessRouteStepper';

const allLayers = ['衬底', 'CP1', 'CP2', 'WLBI', 'CP3', 'AOI'];

export default function WaferStacking() {
  const [showRoute, setShowRoute] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[][]>([]);

  const handleAddTask = () => {
    if (selectedLayers.length > 0) {
      setTasks((prev) => [...prev, selectedLayers]);
    }
  };

  const handleProcessNow = () => {
    alert(`Processing layers: ${selectedLayers.join(', ')}`);
  };

  const handleBatchProcess = () => {
    alert(`Processing ${tasks.length} tasks`);
    setTasks([]);
  };

  return (
    <Group grow>
      <Container fluid p="md">
        <Stack gap="md">
          <Title order={1}>晶圆叠图</Title>

          <Group justify="space-between" align="center">
            <Title order={2}>工艺路线</Title>
            <Switch
              label="显示工艺路线"
              checked={showRoute}
              onChange={(event) => setShowRoute(event.currentTarget.checked)}
            />
          </Group>

          {showRoute && <ProcessRouteStepper demoMode />}

          <Divider my="md" label="叠图处理区" labelPosition="center" />

          <Group align="flex-start" grow>
            {/* Left Side */}
            <Stack w="50%" gap="sm">
              <Switch
                label="显示叠图示意图"
                checked={showDiagram}
                onChange={(event) => setShowDiagram(event.currentTarget.checked)}
              />
              {showDiagram && (
                <Paper shadow="xs" p="sm" h={200}>
                  {/* Replace this div with your actual ThreeJS renderer */}
                  <Box bg="gray.1" h="100%" style={{ border: '1px dashed #ccc' }}>
                    <Text ta="center" pt="xl">[ThreeJS 叠图 + 缺陷示意图]</Text>
                  </Box>
                </Paper>
              )}

              <Checkbox.Group
                label="选择叠图层"
                value={selectedLayers}
                onChange={setSelectedLayers}
              >
                <Stack gap="xs" mt="sm">
                  {allLayers.map((layer) => (
                    <Checkbox key={layer} value={layer} label={layer} />
                  ))}
                </Stack>
              </Checkbox.Group>

              <Group mt="md">
                <Button onClick={handleProcessNow}>立刻处理</Button>
                <Button variant="outline" onClick={handleAddTask}>
                  添加任务
                </Button>
              </Group>
            </Stack>

            {/* Right Side */}
            <Stack w="50%" gap="sm">
              <Title order={3}>待处理任务</Title>
              <ScrollArea h={200}>
                <Stack gap="xs">
                  {tasks.length === 0 ? (
                    <Text c="dimmed">暂无任务</Text>
                  ) : (
                    tasks.map((task, idx) => (
                      <Paper key={idx} shadow="xs" p="xs" radius="sm">
                        <Text size="sm">任务 {idx + 1}: {task.join(', ')}</Text>
                      </Paper>
                    ))
                  )}
                </Stack>
              </ScrollArea>
              <Button onClick={handleBatchProcess} disabled={tasks.length === 0}>
                批量处理
              </Button>
            </Stack>
          </Group>
        </Stack>
      </Container>
    </Group>
  );
}