import { useState } from 'react';
import { Group, Stack, Stepper, Chip, Button, Title, Divider, Tooltip } from '@mantine/core';
import { IconRefresh, IconScanEye } from '@tabler/icons-react';

import { useAppDispatch, useAppSelector } from '@/hooks';
import {
    setRootPath,
    setRegexPattern,
    saveConfig,
    saveConfigToDisk,
    addDataSourcePath,
} from '@/slices/dataSourcePathsConfigSlice';

import {
    RegexConfigs,
    DataSources
} from '@/flows';

import {
    RegexInput,
    PathPicker,
    DirectorySelectList,
    SaveSectionButton
} from '@/components';

import { DataSourceRegex, DataSourceType } from '@/types/DataSource';
import { autoRecognizeFoldersByType } from '@/utils/dataSource';
import { addFolder } from '@/slices/dataSourceStateSlice';
import { toast } from 'react-toastify';

// ALGOs
// import { autoRecognizeFoldersByType } from '@/utils/dataSource';

export function SubfolderSelectorSection({ title, type }: { title: string, type: DataSourceType }) {
    return (
        <div style={{ marginBottom: 24 }}>
            <Title order={3}>{title}</Title>
            <DirectorySelectList type={type} />
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

    // Redux edit handlers
    const handleRegexChange = (newPattern: string, type: keyof DataSourceRegex) => {
        dispatch(setRegexPattern({ type, regex: newPattern }));
    };

    // UI state management
    const [flowStep, setFlowStep] = useState(0);
    const [rootFolderStageOptions, setRootFolderStageOptions] = useState<string[]>(['auto']);

    // Flows
    const regexConfig = RegexConfigs;   // Regex flows
    const dataSourceFlow = DataSources();   // Path flows

    const dataSourcePaths = useAppSelector((state) => state.dataSourcePathsConfig.paths);
    const dataSourceState = useAppSelector((state) => state.dataSourceState);

    const handleAutoFolderRecognition = async () => {
        try {
            const folders = await autoRecognizeFoldersByType(rootPath, regexPatterns);

            let totalDetected = 0;
            let totalAdded = 0;

            for (const [type, paths] of Object.entries(folders)) {
                const typed = type as DataSourceType;
                const existingPaths = new Set(dataSourcePaths[typed]);
                const existingStatePaths = new Set(dataSourceState[typed].map(f => f.path));

                for (const path of paths) {
                    totalDetected += 1;

                    const alreadyExistsInConfig = existingPaths.has(path);
                    const alreadyExistsInState = existingStatePaths.has(path);

                    if (!alreadyExistsInConfig) {
                        dispatch(addDataSourcePath({ type: typed, path }));
                    }

                    if (!alreadyExistsInState) {
                        dispatch(addFolder({ type: typed, path }));
                    }

                    if (!alreadyExistsInConfig && !alreadyExistsInState) {
                        totalAdded += 1;
                    }
                }
            }

            toast.success(
                `自动识别完成：共识别到 ${totalDetected} 个文件夹，其中新增 ${totalAdded} 个。`,
                {
                    closeOnClick: true,
                    pauseOnHover: false,
                    draggable: false,
                }
            );
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : typeof err === 'string'
                        ? err
                        : '自动识别过程中发生未知错误。';

            toast.error(`自动识别失败：${message}`, {
                closeOnClick: true,
                pauseOnHover: false,
                draggable: false,
            });
        }
    };

    const persistDataSourceConfig = () => {
        dispatch(saveConfig())
        dispatch(saveConfigToDisk())
    }

    return (
        <>
            <Stepper active={flowStep} onStepClick={setFlowStep}>
                <Stepper.Step label='配置信息' description='读取配置信息里的持久化内容' />
                <Stepper.Step label='根目录' description='根目录路径有效' />
                <Stepper.Step label='子目录' description='成功配置各个谁的数据源（子目录）' />
                <Stepper.Step label='设备数据' description='读取设备信息' />
            </Stepper>

            <Divider my='md' />

            {/* Section: Root Directory */}
            <Stack align='stretch' gap='md'>
                <Title order={2}>根目录选择</Title>
                <PathPicker
                    label='根目录'
                    value={rootPath}
                    onChange={(v) => dispatch(setRootPath(v))}
                />
                <SaveSectionButton
                    dirty={rootDirty}
                    lastModified={rootLastModified}
                    lastSaved={lastSaved}
                    onSave={persistDataSourceConfig}
                />

                <Group justify='flex-start'>
                    <Chip.Group multiple value={rootFolderStageOptions} onChange={setRootFolderStageOptions}>
                        <Group>
                            <Chip value='displaySubFolderRegex'>显示子目录正则表达式</Chip>
                            {/* <Chip value='auto'>自动识别子目录</Chip> */}
                        </Group>
                    </Chip.Group>
                    <Divider orientation='vertical' />
                    <Button leftSection={<IconScanEye size={18} />} onClick={handleAutoFolderRecognition}>
                        触发自动识别
                    </Button>
                </Group>
            </Stack>

            {/* Section: Regex expressions */}
            {rootFolderStageOptions.includes('displaySubFolderRegex') && (
                <Stack align='stretch' gap='md'>
                    <Title order={3}>子目录自动识别配置</Title>
                    <Stack align='stretch' gap='md'>
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

            <Divider my='sm' />

            {/* Section: Data source subdirectories */}
            <Stack align='stretch' gap='md'>
                <Title order={2}>子目录选择</Title>

                <Tooltip label='刷新' withArrow>
                    <Button
                        variant='light'
                        color='blue'
                        leftSection={<IconRefresh size={16} />}
                        onClick={() => { }}
                    >
                        刷新
                    </Button>
                </Tooltip>

                {dataSourceFlow.map(({ type, name }) => {
                    return (
                        <SubfolderSelectorSection
                            key={type}
                            type={type}
                            title={name}
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
            <Divider my='sm' />
            <Stack align='stretch' gap='md'>
                <Title order={2}>数据预览与统计</Title>
                <Group>
                    <Button>刷新</Button>
                </Group>
            </Stack>
        </>
    );
}