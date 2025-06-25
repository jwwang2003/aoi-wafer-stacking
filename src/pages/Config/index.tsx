import React, { useEffect, useState } from 'react';
import {
    // Structure
    Box,
    Flex,
    Container,
    Group,
    Stack,

    // Components
    SegmentedControl,
    Stepper,
    Chip,
    TextInput,
    NumberInput,
    Slider,
    Button,
    Title,
    Text,
    Divider,
} from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';

import { useAppDispatch, useAppSelector } from '@/hooks';
import {
    setRootPath,
    setSubstratePath,
    setFabCpPath,
    setCp1Path,
    setWlbiPath,
    setCp2Path,
    setAoiPath,
    setRegexPattern
} from '@/slices/configSlice';
import { RegexInput } from '@/components/RegexInput';

interface SubFolderInputProps {
    label: string;
    value: string;
    onChange: (newPath: string) => void;
}

function SubFolderInput({ label, value, onChange }: SubFolderInputProps) {
    const [error, setError] = useState<string | null>(null);

    // user picked via dialog: always a valid dir
    const handleSelect = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: `Select ${label}`,
            });
            if (typeof selected === 'string') {
                onChange(selected);
                setError(null);
            }
        } catch (e: any) {
            setError(`Failed to select folder: ${e.message}`);
        }
    };

    // user typed: validate that it exists & is a folder
    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const candidate = e.currentTarget.value;
        try {
            const info = await stat(candidate);
            if (info.isDirectory) {
                onChange(candidate);
                setError(null);
            } else {
                setError('路径不是目录');
            }
        } catch {
            setError('路径无效或不存在');
        }
    };

    return (
        <TextInput
            label={label}
            placeholder="选择或输入一个目录"
            // controlled: only updates when onChange(candidate) is called
            value={value}
            onChange={handleChange}
            error={error}
            rightSection={
                <Button
                    onClick={handleSelect}
                    compact
                    style={{ width: '100%', height: '100%', padding: 0 }}
                >
                    <IconFolder size={16} strokeWidth={2} />
                </Button>
            }
            sx={{ input: { paddingRight: 100 } }}
        />
    );
}

function DataConfigSubpage() {
    const dispatch = useAppDispatch();

    const rootPath = useAppSelector((s) => s.config.rootPath);
    const substratePath = useAppSelector((s) => s.config.substratePath);
    const fabCpPath = useAppSelector((s) => s.config.fabCpPath);
    const cp1Path = useAppSelector((s) => s.config.cp1Path);
    const wlbiPath = useAppSelector((s) => s.config.wlbiPath);
    const cp2Path = useAppSelector((s) => s.config.cp2Path);
    const aoiPath = useAppSelector((s) => s.config.aoiPath);

    // Stage 1 -- Root folder selection & options
    const [rootFolderStageOptions, setRootFolderStageOptions] = useState<string[]>(["auto"]);

    // Access regex from Redux store
    const regexPatterns = useAppSelector((state) => state.config.regexPatterns);

    // Function to handle regex changes and dispatch to Redux
    const handleRegexChange = (newPattern: string, key: string) => {
        dispatch(setRegexPattern({ key, regex: newPattern }));
    };

    useEffect(() => {
        console.log(rootFolderStageOptions);
    }, [rootFolderStageOptions]);

    const [active, setActive] = useState(1);

    return (
        <>
            <Stepper active={active} onStepClick={setActive}>
                <Stepper.Step label="配置信息" description="读取配置信息里的持久化内容" />
                <Stepper.Step label="根目录" description="根目录路径有效" />
                <Stepper.Step label="子目录" description="成功配置各个谁的数据源（子目录）" />
                <Stepper.Step label="设备数据" description="读取设备信息" />
            </Stepper>
            <Divider my="md" />

            {/* Section 1 */}
            <Stack align="stretch" gap="md">
                <Title order={2}>根目录选择</Title>

                <SubFolderInput
                    label="根目录"
                    value={rootPath}
                    onChange={(v) => dispatch(setRootPath(v))}
                />

                <Group>
                    <Chip.Group
                        multiple
                        value={rootFolderStageOptions}
                        onChange={setRootFolderStageOptions}
                    >
                        <Group>
                            <Chip value="displaySubFolderRegex">
                                显示子目录正则表达式
                            </Chip>
                            <Chip value="auto">
                                自动识别子目录
                            </Chip>
                        </Group>
                    </Chip.Group>
                    <Divider orientation="vertical" />
                    <Button>触发识别</Button>
                </Group>
            </Stack>

            {rootFolderStageOptions.includes("displaySubFolderRegex") && (
                <Stack align="stretch" gap="md">
                    <Title order={3}>子目录自动识别配置</Title>
                    <Stack align="stretch" gap="md">
                        <RegexInput
                            label="文件名正则"
                            defaultRegex={regexPatterns.substrateRegex} // Use the regex from Redux
                            onValidChange={(newPattern) => handleRegexChange(newPattern, 'substrateRegex')} // Dispatch regex change
                        />
                        <RegexInput
                            label="FAB CP文件名正则"
                            defaultRegex={regexPatterns.fabCpRegex} // Use the regex from Redux
                            onValidChange={(newPattern) => handleRegexChange(newPattern, 'fabCpRegex')} // Dispatch regex change
                        />
                        <RegexInput
                            label="CP1文件名正则"
                            defaultRegex={regexPatterns.cp1Regex} // Use the regex from Redux
                            onValidChange={(newPattern) => handleRegexChange(newPattern, 'cp1Regex')} // Dispatch regex change
                        />
                        <RegexInput
                            label="WLBI文件名正则"
                            defaultRegex={regexPatterns.wlbiRegex} // Use the regex from Redux
                            onValidChange={(newPattern) => handleRegexChange(newPattern, 'wlbiRegex')} // Dispatch regex change
                        />
                        <RegexInput
                            label="CP2文件名正则"
                            defaultRegex={regexPatterns.cp2Regex} // Use the regex from Redux
                            onValidChange={(newPattern) => handleRegexChange(newPattern, 'cp2Regex')} // Dispatch regex change
                        />
                        <RegexInput
                            label="AOI文件名正则"
                            defaultRegex={regexPatterns.aoiRegex} // Use the regex from Redux
                            onValidChange={(newPattern) => handleRegexChange(newPattern, 'aoiRegex')} // Dispatch regex change
                        />
                    </Stack>
                </Stack>
            )}

            <Group>
                <Button>保存</Button>
            </Group>

            <Divider my="sm" />

            {/* Section 2 */}
            <Stack align="stretch" gap="md">
                <Title order={2}>子目录选择</Title>
                <SubFolderInput
                    label="衬底路径"
                    value={substratePath}
                    onChange={(v) => dispatch(setSubstratePath(v))}
                />
                <SubFolderInput
                    label="FAB CP路径"
                    value={fabCpPath}
                    onChange={(v) => dispatch(setFabCpPath(v))}
                />
                <SubFolderInput
                    label="CP1路径"
                    value={cp1Path}
                    onChange={(v) => dispatch(setCp1Path(v))}
                />
                <SubFolderInput
                    label="WLBI路径"
                    value={wlbiPath}
                    onChange={(v) => dispatch(setWlbiPath(v))}
                />
                <SubFolderInput
                    label="CP2路径"
                    value={cp2Path}
                    onChange={(v) => dispatch(setCp2Path(v))}
                />
                <SubFolderInput
                    label="AOI路径"
                    value={aoiPath}
                    onChange={(v) => dispatch(setAoiPath(v))}
                />
            </Stack>

            <Group>
                <Button>保存</Button>
            </Group>

            <Divider my="sm" />

            <Stack align="stretch" gap="md">
                <Title order={2}>数据预览与统计</Title>
                <Group>
                    <Button>刷新</Button>
                </Group>
            </Stack>
        </>
    )
}

function SubstrateConfigPage() {
  // Offset and transformation states
  const [xOffset, setXOffset] = useState<number>(0);
  const [yOffset, setYOffset] = useState<number>(0);
  const [leftOffset, setLeftOffset] = useState<number>(0);
  const [rightOffset, setRightOffset] = useState<number>(0);
  const [topOffset, setTopOffset] = useState<number>(0);
  const [bottomOffset, setBottomOffset] = useState<number>(0);
  const [scale, setScale] = useState<number>(1);
  const [warp, setWarp] = useState<number>(0);

  const handleSave = () => {
    // Replace this with actual dispatch or persistence logic
    console.log('保存衬底配置：', {
      xOffset,
      yOffset,
      leftOffset,
      rightOffset,
      topOffset,
      bottomOffset,
      scale,
      warp,
    });
  };

  // Render a paired NumberInput + Slider for each parameter
  return (
    <Stack spacing="md">
      <Title order={2}>衬底配置</Title>
      <Text>在此处调整衬底的偏移量、缩放和扭曲强度。</Text>

      {/* X Offset */}
      <Group align="center">
        <NumberInput
          label="X 偏移量"
          value={xOffset}
          onChange={(val) => setXOffset(val || 0)}
          min={-100}
          max={100}
          step={1}
        />
        <Slider
          value={xOffset}
          onChange={(val) => setXOffset(val)}
          min={-100}
          max={100}
          step={1}
          style={{ flex: 1 }}
        />
      </Group>

      {/* Y Offset */}
      <Group align="center">
        <NumberInput
          label="Y 偏移量"
          value={yOffset}
          onChange={(val) => setYOffset(val || 0)}
          min={-100}
          max={100}
          step={1}
        />
        <Slider
          value={yOffset}
          onChange={(val) => setYOffset(val)}
          min={-100}
          max={100}
          step={1}
          style={{ flex: 1 }}
        />
      </Group>

      {/* Rectangle Side Offsets */}
      <Group align="center">
        <NumberInput
          label="左侧偏移"
          value={leftOffset}
          onChange={(val) => setLeftOffset(val || 0)}
          min={-100}
          max={100}
          step={1}
        />
        <Slider
          value={leftOffset}
          onChange={(val) => setLeftOffset(val)}
          min={-100}
          max={100}
          step={1}
          style={{ flex: 1 }}
        />
      </Group>
      <Group align="center">
        <NumberInput
          label="右侧偏移"
          value={rightOffset}
          onChange={(val) => setRightOffset(val || 0)}
          min={-100}
          max={100}
          step={1}
        />
        <Slider
          value={rightOffset}
          onChange={(val) => setRightOffset(val)}
          min={-100}
          max={100}
          step={1}
          style={{ flex: 1 }}
        />
      </Group>
      <Group align="center">
        <NumberInput
          label="顶部偏移"
          value={topOffset}
          onChange={(val) => setTopOffset(val || 0)}
          min={-100}
          max={100}
          step={1}
        />
        <Slider
          value={topOffset}
          onChange={(val) => setTopOffset(val)}
          min={-100}
          max={100}
          step={1}
          style={{ flex: 1 }}
        />
      </Group>
      <Group align="center">
        <NumberInput
          label="底部偏移"
          value={bottomOffset}
          onChange={(val) => setBottomOffset(val || 0)}
          min={-100}
          max={100}
          step={1}
        />
        <Slider
          value={bottomOffset}
          onChange={(val) => setBottomOffset(val)}
          min={-100}
          max={100}
          step={1}
          style={{ flex: 1 }}
        />
      </Group>

      {/* Scale */}
      <Group align="center">
        <NumberInput
          label="缩放 (Scale)"
          value={scale}
          onChange={(val) => setScale(val || 1)}
          min={0.1}
          max={10}
          step={0.1}
        />
        <Slider
          value={scale}
          onChange={(val) => setScale(val)}
          min={0.1}
          max={10}
          step={0.1}
          style={{ flex: 1 }}
        />
      </Group>

      <Button onClick={handleSave}>保存配置</Button>
    </Stack>
  );
}

export default function ConfigPage() {
    const [selectedOption, setSelectedOption] = useState<string>('数据源');

    // Handle SegmentedControl change
    const handleSegmentedControlChange = (value: string) => {
        setSelectedOption(value);
    };

    let componentToDisplay;

    // Switch case based on selectedOption
    switch (selectedOption) {
        case '数据源':
        componentToDisplay = <DataConfigSubpage />;
        break;
        case '衬底配置':
        componentToDisplay = <SubstrateConfigPage />;
        break;
        default:
        componentToDisplay = <div>请选择一个选项</div>; // Default component if no option is selected
    }

    const [saveError, setSaveError] = useState<string | null>(null);

    // const saveConfig = () => {
    //     if (
    //         !rootPath ||
    //         !substratePath ||
    //         !fabCpPath ||
    //         !cp1Path ||
    //         !wlbiPath ||
    //         !cp2Path ||
    //         !aoiPath
    //     ) {
    //         setSaveError('请填写所有目录路径后再保存。');
    //         return;
    //     }
    //     setSaveError(null);
    //     console.log('Saving full config:', {
    //         rootPath,
    //         substratePath,
    //         fabCpPath,
    //         cp1Path,
    //         wlbiPath,
    //         cp2Path,
    //         aoiPath,
    //     });
    //     // dispatch thunk to persist config…
    // };

    return (
        <Group grow>
            <Container fluid p="md">

                <Stack gap="md">
                    <Title order={1}>配置</Title>
                    <SegmentedControl
                        data={['数据源', '衬底配置']}
                        value={selectedOption}
                        onChange={handleSegmentedControlChange}
                    />
                    {componentToDisplay} {/* Render the selected component */}
                </Stack>
            </Container>
        </Group>
    );
}