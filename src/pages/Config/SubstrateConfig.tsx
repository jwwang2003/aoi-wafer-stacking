//不知道为啥读取路径为aoi-wafer-stacking/src-tauri/target/debug/86107919CNF1.xls
//目前仅能读取当个xls文件的一个list

import { useAppDispatch, useAppSelector } from '@/hooks';
import { setOffsets } from '@/slices/preferencesSlice';
import { OffsetConfig } from '@/types/Preferences';

import {
  Group,
  NumberInput,
  Slider,
  Stack,
  Text,
  Title,
  Box,
  Flex,
  Input,
  Button,
  InputWrapper
} from '@mantine/core';
import { useState, useEffect } from 'react';
import { resolveResource } from '@tauri-apps/api/path';
import SubstrateRenderer from '@/components/Wafer';

function SubstrateThreeView({
  xOffset,
  yOffset,
  scale,
  filePath,
}: OffsetConfig & { filePath: string }) {
  useEffect(() => {
    console.log('[SubstrateThreeView] 传递给渲染器的文件路径:', filePath);
    if (!filePath) {
      console.warn('[SubstrateThreeView] 文件路径为空');
    }
  }, [filePath]);

  return (
    <Box
      style={{
        height: '600px',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <SubstrateRenderer
        filePath={filePath}
        gridSize={5}
        overlapColor={0xfa5959}
        style={{
          transform: `translate(${xOffset}px, ${yOffset}px) scale(${scale})`,
        }}
      />
    </Box>
  );
}

export default function SubstrateConfigPage() {
  const dispatch = useAppDispatch();
  const offset = useAppSelector((state) => state.preferences.offsets);
  const [filePath, setFilePath] = useState('86107919CNF1.xls');
  const [error, setError] = useState('');

  useEffect(() => {
    const validateDefaultPath = async () => {
      console.log('[初始化] 默认文件路径:', filePath);
      try {
        const resolvedPath = await resolveResource(filePath);
        console.log('[初始化] 解析后的默认路径:', resolvedPath);
        setFilePath(resolvedPath);
      } catch (err) {
        console.error('[初始化] 默认路径解析失败:', err);
        setError(
          '默认路径解析失败: ' +
            (err instanceof Error ? err.message : String(err))
        );
      }
    };

    validateDefaultPath();
  }, []);

  const selectFile = async () => {
    try {
      setError('');
      const selected = await open({
        filters: [
          {
            name: 'Excel Files',
            extensions: ['xls'],
          },
        ],
        multiple: false,
      });

      if (selected && typeof selected === 'string') {
        console.log('[文件选择] 用户选中的完整路径:', selected);
        setFilePath(selected);

        try {
          const resolved = await resolveResource(selected);
          console.log('[文件选择] 验证通过的路径:', resolved);
        } catch (err) {
          console.error('[文件选择] 选中的文件无法访问:', err);
          setError(
            '选中的文件无法访问: ' +
              (err instanceof Error ? err.message : String(err))
          );
        }
      }
    } catch (err) {
      console.error('[文件选择] 对话框错误:', err);
      setError(
        '选择文件失败: ' + (err instanceof Error ? err.message : String(err))
      );
    }
  };

  // 手动输入路径处理
  const handlePathInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputPath = e.target.value;
    console.log('[手动输入] 用户输入的路径:', inputPath);

    try {
      const resolvedPath = await resolveResource(inputPath);
      console.log('[手动输入] 解析后的完整路径:', resolvedPath);
      setFilePath(resolvedPath);
      setError('');
    } catch (err) {
      console.error('[手动输入] 路径解析错误:', err);
      setFilePath(inputPath);
      setError(
        '路径无效: ' + (err instanceof Error ? err.message : String(err))
      );
    }
  };

  const updateOffset = async (key: keyof OffsetConfig, value: number) => {
    await dispatch(setOffsets({ [key]: value }));
  };

  const renderControl = (
    label: string,
    key: keyof OffsetConfig,
    min: number,
    max: number,
    step: number
  ) => (
    <Group align='center'>
      <NumberInput
        label={label}
        value={offset[key] || 0}
        onChange={(val) => updateOffset(key, Number(val))}
        min={min}
        max={max}
        step={step}
        w={120}
      />
      <Slider
        value={offset[key] || 0}
        onChange={(val) => updateOffset(key, val)}
        min={min}
        max={max}
        step={step}
        style={{ flex: 1 }}
      />
    </Group>
  );

  return (
    <Flex gap='lg' align='flex-start' justify='space-between'>
      {/* Left Panel: Controls */}
      <Stack w='50%' gap='md'>
        <Title order={2}>衬底配置</Title>
        <Text>在此处调整衬底的偏移量、缩放和扭曲强度。</Text>

        {/* 文件路径输入和选择区域 */}
<Group align='flex-end' gap='sm' style={{ width: '100%' }}>
  {/* 用InputWrapper包裹Input来添加label */}
  <InputWrapper label="文件路径" style={{ flex: 1, marginBottom: 0 }}>
    <Input
      value={filePath}
      onChange={handlePathInput}
      placeholder="输入文件路径或点击选择"
    />
  </InputWrapper>
  <Button onClick={selectFile}>选择文件</Button>
</Group>

        {/* 显示当前使用的完整路径 */}
        <Text size='sm' c={error ? 'red' : 'blue'}>
          {error ? error : `当前使用的完整路径: ${filePath}`}
        </Text>

        {renderControl('X 偏移量', 'xOffset', -100, 100, 1)}
        {renderControl('Y 偏移量', 'yOffset', -100, 100, 1)}
        {renderControl('左侧偏移', 'leftOffset', -100, 100, 1)}
        {renderControl('右侧偏移', 'rightOffset', -100, 100, 1)}
        {renderControl('顶部偏移', 'topOffset', -100, 100, 1)}
        {renderControl('底部偏移', 'bottomOffset', -100, 100, 1)}
        {renderControl('缩放 (Scale)', 'scale', 0.1, 10, 0.1)}
        {renderControl('扭曲 (Warp)', 'warp', -100, 100, 1)}

        <Text size='sm' c='dimmed' mt='xs'>
          所有更改都会自动保存，无需手动操作。
        </Text>
      </Stack>

      {/* Right Panel: Three.js Canvas */}
      <Box w='50%'>
        <SubstrateThreeView {...offset} filePath={filePath} />
      </Box>
    </Flex>
  );
}
