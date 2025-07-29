import { useState } from 'react';
import { Group, Stack, Stepper, Chip, Button, Title, Divider, Tooltip } from '@mantine/core';
import { IconRefresh, IconScanEye } from '@tabler/icons-react';

import { useAppDispatch, useAppSelector } from '@/hooks';
import {
    setRootPath,

    setSubstratePaths,
    setCpProberPaths,
    setWlbiPaths,
    setAoiPaths,
    setRegexPattern,

    saveConfig,
    saveConfigToDisk,
} from '@/slices/dataSourcePathsConfigSlice';
import { autoRecognizeFoldersByType } from '@/utils/dataSource';
import {
    RegexConfigs,
    DataSources
} from "@/flows";
import {
    RegexInput,
    PathPicker,
    DirectorySelectList,
    SaveSectionButton
} from "@/components";
import { DirectorySelectListRef } from '@/components/DirectorySelectList';

// A wrapper for the subfolders selector section
interface Props {
    title: string;
    paths: string[];
    onChange: (newPaths: string[]) => void;
    listRef: React.RefObject<DirectorySelectListRef>;
}

export function SubfolderSelectorSection({
    title,
    paths,
    onChange,
    listRef,
}: Props) {
    return (
        <div style={{ marginBottom: 24 }}>
            <Title order={3}>{title}</Title>
            <DirectorySelectList ref={listRef} value={paths} onChange={onChange} />
        </div>
    );
}

export default function DataConfigSubpage() {
    // React-Redux stuff
    const dispatch = useAppDispatch();

    const { rootPath, rootLastModified } = useAppSelector((state) => state.dataSourcePathsConfig);
    const regexLastModified = useAppSelector((state) => state.dataSourcePathsConfig.regex.lastModified);
    const pathsLastModified = useAppSelector((state) => state.dataSourcePathsConfig.paths.lastModified);
    const lastSaved = useAppSelector((state) => state.dataSourcePathsConfig.lastSaved);

    // Dirty flags
    // Prompt the user to save the sections that are dirty before allowing them
    // to proced to the next stage or step.
    const rootDirty = rootLastModified > lastSaved;
    const regexDirty = regexLastModified > lastSaved;
    const pathsDirty = pathsLastModified > lastSaved;

    // Regex patterns from Redux
    const regexPatterns = useAppSelector((state) => state.dataSourcePathsConfig.regex);

    // Data source paths from Redux
    const dataSourcePaths = useAppSelector((state) => {
        return state.dataSourcePathsConfig.paths
    })

    // Redux edit handlers
    const handleRegexChange = (newPattern: string, key: keyof typeof regexPatterns) => {
        dispatch(setRegexPattern({ key, regex: newPattern }));
    };

    // UI state management
    const [flowStep, setFlowStep] = useState(0);
    const [rootFolderStageOptions, setRootFolderStageOptions] = useState<string[]>(['auto']);

    // Flows
    const regexConfig = RegexConfigs;   // Regex flows
    const dataSourceFlow = DataSources();   // Path flows

    const persistDataSourceConfig = () => {
        dispatch(saveConfig())
        dispatch(saveConfigToDisk())
    }

    const handleAutoSubfolderRecongition = async () => {
        dataSourceFlow.forEach((item) => {
            item.ref.current?.refresh();
        })
    };

    const revalidateDataSourceFolders = () => {
        dataSourceFlow.forEach((item) => {
            item.ref.current?.refresh();
        });
        console.debug("Revalidated data source folder(s)!");
    };

    return (
        <>
            <Stepper active={flowStep} onStepClick={setFlowStep}>
                <Stepper.Step label="配置信息" description="读取配置信息里的持久化内容" />
                <Stepper.Step label="根目录" description="根目录路径有效" />
                <Stepper.Step label="子目录" description="成功配置各个谁的数据源（子目录）" />
                <Stepper.Step label="设备数据" description="读取设备信息" />
            </Stepper>

            <Divider my="md" />

            {/* Section: Root Directory */}
            <Stack align="stretch" gap="md">
                <Title order={2}>根目录选择</Title>
                <PathPicker
                    label="根目录"
                    value={rootPath}
                    onChange={(v) => dispatch(setRootPath(v))}
                />
                <SaveSectionButton
                    dirty={rootDirty}
                    lastModified={rootLastModified}
                    lastSaved={lastSaved}
                    onSave={persistDataSourceConfig}
                />

                <Group justify="flex-start">
                    <Chip.Group multiple value={rootFolderStageOptions} onChange={setRootFolderStageOptions}>
                        <Group>
                            <Chip value="displaySubFolderRegex">显示子目录正则表达式</Chip>
                            {/* <Chip value="auto">自动识别子目录</Chip> */}
                        </Group>
                    </Chip.Group>
                    <Divider orientation="vertical" />
                    <Button leftSection={<IconScanEye size={18} />} onClick={handleAutoSubfolderRecongition}>
                        触发自动识别
                    </Button>
                </Group>
            </Stack>

            {/* Section: Regex expressions */}
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
                    <SaveSectionButton
                        dirty={regexDirty}
                        lastModified={regexLastModified}
                        lastSaved={lastSaved}
                        onSave={persistDataSourceConfig}
                    />
                </Stack>
            )}

            <Divider my="sm" />

            {/* Section: Data source subdirectories */}
            <Stack align="stretch" gap="md">
                <Title order={2}>子目录选择</Title>

                <Tooltip label="刷新" withArrow>
                    <Button
                        variant="light"
                        color="blue"
                        leftSection={<IconRefresh size={16} />}
                        onClick={revalidateDataSourceFolders}
                    >
                        刷新
                    </Button>
                </Tooltip>

                {dataSourceFlow.map(({ type, name, selector, onChange, ref }) => {
                    const paths = useAppSelector(selector);
                    return (
                        <SubfolderSelectorSection
                            key={type}
                            title={name}
                            paths={paths}
                            onChange={(newPaths) => onChange(newPaths, dispatch)}
                            listRef={ref}
                        />
                    );
                })}
            </Stack>
            <SaveSectionButton
                dirty={pathsDirty}
                lastModified={pathsLastModified}
                lastSaved={lastSaved}
                onSave={persistDataSourceConfig}
            />

            {/* Section: Data source stats */}
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