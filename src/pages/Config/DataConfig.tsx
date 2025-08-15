import { useEffect, useState } from 'react';
import { Group, Stack, Chip, Button, Title, Divider } from '@mantine/core';
import { IconScanEye } from '@tabler/icons-react';

import { useAppDispatch, useAppSelector } from '@/hooks';
import {
    setRegexPattern,
    setRootPath,
    revalidateDataSource,
    scanDataSourceFolders,
    removeAllDataSourcePaths,
    triggerSave as dataSourceTriggerSave
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

import { DataSourceRegex, DataSourceType } from '@/types/dataSource';
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

    const dataSourceConfig = useAppSelector((s) => s.dataSourceConfig);
    const { rootPath, rootLastModified, paths, regex, lastSaved } = dataSourceConfig;
    const { lastModified: pathsLastModified } = paths;
    const { lastModified: regexLastModified } = regex;

    // Dirty flags
    // Prompt the user to save the sections that are dirty before allowing them
    // to proceed to the next stage or step.
    const rootDirty = rootLastModified >= lastSaved;
    const regexDirty = regexLastModified >= lastSaved;
    const pathsDirty = pathsLastModified >= lastSaved;

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
        if (!mounted && dataSourceConfig) {
            setMounted(true);
            // If anything is dirty, on first load, trigger a save
            if (rootDirty || regexDirty || pathsDirty) dispatch(dataSourceTriggerSave());
        }
    }, [rootDirty, regexDirty, pathsDirty,]);

    // =========================================================================
    // NOTE: METHODS
    // =========================================================================
    const handleAutoFolderRecognition = async () => await dispatch(scanDataSourceFolders());

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
        if (mounted) init();
    }, [mounted]);

    return (
        <>
            {/* Section: Root Directory */}
            <Stack align='stretch' gap='md'>
                <Title order={2}>根目录选择</Title>
                <PathPicker label='根目录' value={rootPath} onChange={handleRootFolderChange} />
                <LastSaved dirty={rootDirty} lastModified={rootLastModified} lastSaved={lastSaved} />

                <Group justify='flex-start'>
                    <Chip.Group multiple value={rootFolderStageOptions} onChange={setRootFolderStageOptions}>
                        <Group>
                            <Chip value='displaySubFolderRegex'>显示子目录正则表达式</Chip>
                            {/* <Chip value='auto'>自动识别子目录</Chip> */}
                        </Group>
                    </Chip.Group>
                    <Divider orientation='vertical' />
                    <Button leftSection={<IconScanEye size={18} />} onClick={handleAutoFolderRecognition}>
                        触发子目录识别
                    </Button>
                </Group>
            </Stack>

            {/* Section: Regex expressions */}
            {rootFolderStageOptions.includes('displaySubFolderRegex') && (
                <Stack align='stretch' gap='md'>
                    <Title order={3}>子目录自动识别配置</Title>
                    <Stack align='stretch' gap='md'>
                        {regexConfig.map(({ label, key }) =>
                            <RegexInput
                                key={key}
                                label={label}
                                defaultRegex={regexPatterns[key]}
                                onValidChange={(r) => handleRegexChange(r, key)}
                            />
                        )}
                    </Stack>
                    <LastSaved dirty={regexDirty} lastModified={regexLastModified} lastSaved={lastSaved} />
                </Stack>
            )}

            <Divider my='sm' />

            {/* Section: Data source subdirectories */}
            <Stack align='stretch' gap='md'>
                <Title order={2}>子目录选择</Title>
                {dataSourceFlow.map(({ type, name }) =>
                    <SubfolderSelectorSection key={type} type={type} title={name} />
                )}
            </Stack>
            <LastSaved dirty={pathsDirty} lastModified={pathsLastModified} lastSaved={lastSaved} />

            {/* Section: Data source stats */}
            {/* NOTE: moved to another page */}
        </>
    );
}