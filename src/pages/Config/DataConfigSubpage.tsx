import { useEffect, useState } from 'react';
import { Selector } from 'react-redux';
import { Indicator, Group, Stack, Stepper, Chip, Button, Title, Text, Divider } from '@mantine/core';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
    setRootPath,
    setSubstratePaths,
    setCp1Paths,
    setCp2Paths,
    setWlbiPaths,
    setCp3Paths,
    setAoiPaths,
    setRegexPattern,
    saveConfig,
} from '@/slices/configSlice';
import { RegexInput } from '@/components/RegexInput';
import SubFolderInput from '@/components/FolderSelect';
import DirectorySelectList from '@/components/DirectorySelectList';

// =============================================================================
// ================================= Types =====================================
// =============================================================================

interface DataSourceFlowItem {
    name: string;
    title: string;
    paths: ReturnType<Selector<any, any>>; // Adjust 'any' types if you have a proper AppState type
    onChange: (newValue: any) => void;     // Adjust `any` if you know the exact type for paths
}


// A wrapper for the subfolders selector section
function SubfolderSelectorSection({
    title,
    paths,
    onChange,
}: {
    title: string;
    paths: string[];
    onChange: (newPaths: string[]) => void;
}) {
    return (
        <div style={{ marginBottom: 24 }}>
            <Title order={3}>{title}</Title>
            <DirectorySelectList value={paths} onChange={onChange} />
        </div>
    );
}

export default function DataConfigSubpage() {
    const dispatch = useAppDispatch();

    // Section timestamps from Redux
    const { rootPath, rootLastModified } = useAppSelector((state) => state.config);
    const regexLastModified = useAppSelector((state) => state.config.regex.lastModified);
    const pathsLastModified = useAppSelector((state) => state.config.paths.lastModified);
    const lastSaved = useAppSelector((state) => state.config.lastSaved);

    // Dirty flags
    // Prompt the user to save the sections that are dirty before allowing them
    // to proced to the next stage or step.
    const rootDirty = rootLastModified > lastSaved;
    const regexDirty = regexLastModified > lastSaved;
    const pathsDirty = pathsLastModified > lastSaved;

    // Regex patterns from Redux
    const regexPatterns = useAppSelector((state) => state.config.regex);

    // Edit handlers
    const handleRegexChange = (newPattern: string, key: keyof typeof regexPatterns) => {
        dispatch(setRegexPattern({ key, regex: newPattern }));
    };

    const [active, setActive] = useState(0);
    const [rootFolderStageOptions, setRootFolderStageOptions] = useState<string[]>(['auto']);

    useEffect(() => {
        // e.g. logging
    }, [rootFolderStageOptions]);

    // Flow(s)
    // Regex flows
    type RegexKey = keyof typeof regexPatterns; // assuming regexPatterns is typed
    const regexConfig: { label: string; key: RegexKey }[] = [
        { label: '文件名正则', key: 'substrateRegex' },
        { label: 'CP1文件名正则', key: 'cp1Regex' },
        { label: 'CP2文件名正则', key: 'cp2Regex' },
        { label: 'WLBI文件名正则', key: 'wlbiRegex' },
        { label: 'CP3文件名正则', key: 'cp3Regex' },
        { label: 'AOI文件名正则', key: 'aoiRegex' },
    ];
    // Path flows
    const DataSourceFlow: DataSourceFlowItem[] = [
        {
            name: "substrate",
            title: "衬底 (substrate)",
            paths: useAppSelector((s) => s.config.paths.substratePaths),
            onChange: (ps: string[]) => dispatch(setSubstratePaths(ps)),
        },
        {
            name: "cp1",
            title: "CP1",
            paths: useAppSelector((s) => s.config.paths.cp1Paths),
            onChange: (ps: string[]) => dispatch(setCp1Paths(ps)),
        },
        {
            name: "cp2",
            title: "CP2",
            paths: useAppSelector((s) => s.config.paths.cp2Paths),
            onChange: (ps: string[]) => dispatch(setCp2Paths(ps)),
        },
        {
            name: "wlbi",
            title: "WLBI",
            paths: useAppSelector((s) => s.config.paths.wlbiPaths),
            onChange: (ps: string[]) => dispatch(setWlbiPaths(ps)),
        },
        {
            name: "cp3",
            title: "CP3",
            paths: useAppSelector((s) => s.config.paths.cp3Paths),
            onChange: (ps: string[]) => dispatch(setCp3Paths(ps)),
        },
        {
            name: "aoi",
            title: "AOI",
            paths: useAppSelector((s) => s.config.paths.aoiPaths),
            onChange: (ps: string[]) => dispatch(setAoiPaths(ps)),
        },
    ];

    return (
        <>
            <Stepper active={active} onStepClick={setActive}>
                <Stepper.Step label="配置信息" description="读取配置信息里的持久化内容" />
                <Stepper.Step label="根目录" description="根目录路径有效" />
                <Stepper.Step label="子目录" description="成功配置各个谁的数据源（子目录）" />
                <Stepper.Step label="设备数据" description="读取设备信息" />
            </Stepper>
            <Divider my="md" />

            {/* Section: Root Directory */}
            <Stack align="stretch" gap="md">
                <Title order={2}>根目录选择</Title>
                <SubFolderInput
                    label="根目录"
                    value={rootPath}
                    onChange={(v) => dispatch(setRootPath(v))}
                />
                <Group>
                    <Indicator color="blue" withBorder disabled={!rootDirty}>
                        <Button color={rootDirty ? 'green' : undefined} onClick={() => dispatch(saveConfig())}>
                            保存
                        </Button>
                    </Indicator>
                    <Text size="sm" color={rootDirty ? 'green' : undefined}>
                        最后保存: {new Date(lastSaved).toLocaleString()}
                    </Text>
                </Group>

                <Group justify="flex-start">
                    <Chip.Group multiple value={rootFolderStageOptions} onChange={setRootFolderStageOptions}>
                        <Group>
                            <Chip value="displaySubFolderRegex">显示子目录正则表达式</Chip>
                            <Chip value="auto">自动识别子目录</Chip>
                        </Group>
                    </Chip.Group>
                    <Divider orientation="vertical" />
                    <Button>触发识别</Button>
                </Group>
            </Stack>

            {rootFolderStageOptions.includes('displaySubFolderRegex') && (
                <Stack align="stretch" gap="md">
                    <Title order={3}>子目录自动识别配置</Title>
                    <Stack align="stretch" gap="md">
                        {regexConfig.map(({ label, key }) => (
                            <RegexInput
                            key={key}
                            label={label}
                            defaultRegex={regexPatterns[key]}
                            onValidChange={(r) => handleRegexChange(r, key)}
                            />
                        ))}
                    </Stack>
                    <Group>
                        <Indicator color="blue" withBorder disabled={!regexDirty}>
                            <Button color={regexDirty ? 'green' : undefined} onClick={() => dispatch(saveConfig())}>
                                保存
                            </Button>
                        </Indicator>
                        <Text size="sm" color={regexDirty ? 'green' : undefined}>
                            最后保存: {new Date(lastSaved).toLocaleString()}
                        </Text>
                    </Group>
                </Stack>
            )}

            <Divider my="sm" />

            {/* Section: Subdirectories */}
            <Stack align="stretch" gap="md">
                <Title order={2}>子目录选择</Title>
                {DataSourceFlow.map((flow) => (
                    <SubfolderSelectorSection
                        key={flow.name}
                        title={flow.title}
                        paths={flow.paths}
                        onChange={flow.onChange}
                    />
                ))}
            </Stack>

            <Group>
                <Indicator color="blue" withBorder disabled={!pathsDirty}>
                    <Button color={pathsDirty ? 'green' : undefined} onClick={() => dispatch(saveConfig())}>
                        保存
                    </Button>
                </Indicator>
                <Text size="sm" color={pathsDirty ? 'green' : undefined}>
                    最后保存: {new Date(lastSaved).toLocaleString()}
                </Text>
            </Group>

            <Divider my="sm" />
            <Stack align="stretch" gap="md">
                <Title order={2}>数据预览与统计</Title>
                <Group>
                    <Button>刷新</Button>
                </Group>
            </Stack>
        </>
    );
}