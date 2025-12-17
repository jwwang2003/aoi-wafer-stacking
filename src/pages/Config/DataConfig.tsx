import { useEffect, useState } from 'react';
import { Group, Stack, Chip, Button, Title, Divider } from '@mantine/core';
import { IconScanEye } from '@tabler/icons-react';

import { useAppDispatch, useAppSelector } from '@/hooks';
import {
    setRegexPattern,
    setRootPath,
    revalidateDataSource,
    scanDataSourceFolders
} from '@/slices/dataSourceConfigSlice';

import {
    RegexConfigs,
    DataSources
} from '@/flows';

import {
    RegexInput,
    PathPicker,
    DataSourceDirectorySelectList
} from '@/components';

import { DataSourceRegex, DataSourceType } from '@/types/dataSource';
import { AutoTriggers } from '@/types/preferences';
import AutoTriggerSwitch from '@/components/UI/AutoTriggerSwitch';
import { IS_DEV } from '@/env';
import { AuthRole } from '@/types/auth';
import { errorToast } from '@/components/UI/Toaster';

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
    const dispatch = useAppDispatch();

    const autoTrigger = useAppSelector(s => s.preferences.autoTriggers.folderDetection);
    const role = useAppSelector(s => s.auth.role);
    const readOnly = !IS_DEV && role !== AuthRole.Admin;

    const dataSourceConfig = useAppSelector((s) => s.dataSourceConfig);
    const { rootPath, regex: regexPatterns } = dataSourceConfig;

    // Redux edit handlers
    const handleRegexChange = (newPattern: string, type: keyof DataSourceRegex) => {
        if (readOnly) {
            errorToast({ title: '需要管理员权限', message: '生产环境下修改子目录正则需要管理员权限。' });
            return;
        }
        dispatch(setRegexPattern({ type, regex: newPattern }));
    };

    // UI state management
    const [rootFolderStageOptions, setRootFolderStageOptions] = useState<string[]>(['auto']);

    // Flows
    const regexConfig = RegexConfigs;   // Regex flows
    const dataSourceFlow = DataSources;   // Path flows

    // =========================================================================
    // NOTE: METHODS
    // =========================================================================
    const handleAutoFolderRecognition = async () => {
        if (readOnly) {
            errorToast({ title: '需要管理员权限', message: '生产环境下识别子目录会修改数据源，需要管理员权限。' });
            return;
        }
        await dispatch(scanDataSourceFolders());
    };

    const handleRootFolderChange = async (u: string) => {
        if (readOnly) {
            errorToast({ title: '需要管理员权限', message: '生产环境下修改根目录需要管理员权限。' });
            return;
        }
        // Do not clear existing folders when setting a new root.
        // Preserve previously configured folders and simply update the root path.
        await dispatch(setRootPath(u));
    }

    // =========================================================================
    // NOTE: REACT
    // =========================================================================
    useEffect(() => {
        // Keep config state aligned with file contents; avoid auto-scanning folders on mount.
        dispatch(revalidateDataSource());
    }, [dispatch, autoTrigger, rootPath, regexPatterns]);

    return (
        <>
            {/* Section: Root Directory */}
            <Stack align="stretch" gap="md">
                <Title order={2}>根目录选择</Title>
                <PathPicker label="根目录" value={rootPath} onChange={handleRootFolderChange} disabled={readOnly} />

                <Group justify="flex-start">
                    <Chip.Group
                        multiple
                        value={rootFolderStageOptions}
                        onChange={setRootFolderStageOptions}
                    >
                        <Group>
                            <Chip value="displaySubFolderRegex">显示子目录正则表达式</Chip>
                            {/* <Chip value="auto">自动识别子目录</Chip> */}
                        </Group>
                    </Chip.Group>
                    <Divider orientation="vertical" />
                    <Button
                        leftSection={<IconScanEye size={18} />}
                        onClick={handleAutoFolderRecognition}
                        disabled={readOnly}
                    >
                        触发子目录识别
                    </Button>
                    <AutoTriggerSwitch type={AutoTriggers.folderDetection} disabled={readOnly} />
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
                                disabled={readOnly}
                            />
                        ))}
                    </Stack>
                </Stack>
            )}

            <Divider my="sm" />

            {/* Section: Data source subdirectories */}
            <Stack align="stretch" gap="md">
                <Title order={2}>子目录选择</Title>
                {dataSourceFlow.map(({ type, name }) =>
                    <SubfolderSelectorSection key={type} type={type} title={name} />
                )}
            </Stack>

            {/* Section: Data source stats */}
            {/* NOTE: moved to another page */}
        </>
    );
}
