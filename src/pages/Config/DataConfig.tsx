import { useEffect, useState } from 'react';
import { Group, Stack, Chip, Button, Title, Divider, Tooltip } from '@mantine/core';
import { IconRefresh, IconScanEye } from '@tabler/icons-react';

import { useAppDispatch, useAppSelector } from '@/hooks';
import {
    setRegexPattern,
    setRootPath,
    revalidateDataSource,
    scanDataSourceFolders,
    removeAllDataSourcePaths
} from '@/slices/dataSourceConfigSlice';

import {
    RegexConfigs,
    DataSources
} from '@/flows';

import {
    RegexInput,
    PathPicker,
    DataSourceDirectorySelectList,
    LastSaved
} from '@/components';

import { DataSourceRegex, DataSourceType } from '@/types/DataSource';
import { resetFolders } from '@/slices/dataSourceStateSlice';

export function SubfolderSelectorSection({ title, type }: { title: string, type: DataSourceType }) {
    return (
        <div style={{ marginBottom: 24 }}>
            <Title order={3}>{title}</Title>
            <DataSourceDirectorySelectList type={type} />
        </div>
    );
}

export default function DataConfigSubpage() {
    // React-Redux stuff
    const [mounted, setMounted] = useState<boolean>(false);
    const dispatch = useAppDispatch();

    const { rootPath, rootLastModified } = useAppSelector((state) => state.dataSourceConfig);
    const { paths } = useAppSelector((state) => state.dataSourceConfig);
    const regexLastModified = useAppSelector((state) => state.dataSourceConfig.regex.lastModified);
    const pathsLastModified = useAppSelector((state) => state.dataSourceConfig.paths.lastModified);
    const lastSaved = useAppSelector((state) => state.dataSourceConfig.lastSaved);

    // Dirty flags
    // Prompt the user to save the sections that are dirty before allowing them
    // to proceed to the next stage or step.
    const rootDirty = rootLastModified > lastSaved;
    const regexDirty = regexLastModified > lastSaved;
    const pathsDirty = pathsLastModified > lastSaved;

    // Regex patterns from Redux
    const regexPatterns = useAppSelector((state) => state.dataSourceConfig.regex);

    // Redux edit handlers
    const handleRegexChange = (newPattern: string, type: keyof DataSourceRegex) => {
        dispatch(setRegexPattern({ type, regex: newPattern }));
    };

    // UI state management
    const [rootFolderStageOptions, setRootFolderStageOptions] = useState<string[]>(['auto']);

    // Flows
    const regexConfig = RegexConfigs;   // Regex flows
    const dataSourceFlow = DataSources;   // Path flows

    // =========================================================================
    // NOTE: INIT
    // =========================================================================
    useEffect(() => {
        if (!mounted) {
            setMounted(true);
        }
    }, []);

    // =========================================================================
    // NOTE: METHODS
    // =========================================================================
    const handleAutoFolderRecognition = async () => {
        await dispatch(scanDataSourceFolders());
    };

    const handleRootFolderChange = async (u: string) => {
        await dispatch(removeAllDataSourcePaths());
        await dispatch(resetFolders());
        await dispatch(setRootPath(u));
    }

    // =========================================================================
    // NOTE: REACT
    // =========================================================================
    useEffect(() => {
        const init = async () => {
            await dispatch(scanDataSourceFolders());
            await dispatch(revalidateDataSource());
        }
        if (mounted) {
            init();
        }
    }, [mounted]);

    // useEffect(() => {
    //     const init = async () => {
    //         await dispatch(scanDataSourceFolders());
    //     }
    //     if (mounted) {
    //         init();
    //     }
    // }, [paths]);

    return (
        <>
            {/* Section: Root Directory */}
            <Stack align='stretch' gap='md'>
                <Title order={2}>根目录选择</Title>
                <PathPicker
                    label='根目录'
                    value={rootPath}
                    onChange={handleRootFolderChange}
                />
                <LastSaved
                    dirty={rootDirty}
                    lastModified={rootLastModified}
                    lastSaved={lastSaved}
                // onSave={persistDataSourceConfig}
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
                    <LastSaved
                        dirty={regexDirty}
                        lastModified={regexLastModified}
                        lastSaved={lastSaved}
                    // onSave={persistDataSourceConfig}
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
            <LastSaved
                dirty={pathsDirty}
                lastModified={pathsLastModified}
                lastSaved={lastSaved}
            // onSave={persistDataSourceConfig}
            />

            {/* Section: Data source stats */}
            {/* NOTE: moved to another page */}
        </>
    );
}