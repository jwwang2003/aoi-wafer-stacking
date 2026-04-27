import { useEffect, useState } from 'react';
import {
    Stack,
    Group,
    Title,
    Button,
    Text,
    Divider,
    Badge,
    ScrollArea,
    Switch,
    Tooltip,
    SimpleGrid,
    Modal,
    Alert,
    Table,
    ActionIcon,
    NumberInput,
    TextInput,
} from '@mantine/core';
import { IconCheck, IconX, IconUpload, IconEdit, IconTrash, IconPlus } from '@tabler/icons-react';
import { exists, stat } from '@tauri-apps/plugin-fs';

import { useAppDispatch, useAppSelector } from '@/hooks';
import { initPreferences, revalidatePreferencesFile, resetPreferencesToDefault, setDataSourceConfigPath, setAutoTriggerState, setDieLayoutXlsPath } from '@/slices/preferencesSlice';
import { resetDataSourceConfigToDefault } from '@/slices/dataSourceConfigSlice';
import { resetFolders } from '@/slices/dataSourceStateSlice';
import { PathPicker, JsonCode } from '@/components';

import { appDataDir, resolve } from '@tauri-apps/api/path';
import { DB_FILENAME } from '@/constants';
import { prepPreferenceWriteOut } from '@/utils/helper';
import { infoToast, errorToast } from '@/components/UI/Toaster';
import { norm } from '@/utils/fs';
import { useNavigate } from 'react-router-dom';
import { AutoTriggers } from '@/types/preferences';
import { IS_DEV } from '@/env';
import { AuthRole } from '@/types/auth';
import { BinConfigFile, DEFAULT_BIN_VALUES_CONFIG, DEFAULT_MAPPING_RULE, BinMappingRule, BinConfig } from './binConfig';

export default function PreferencesSubpage() {
    const navigate = useNavigate();

    const dispatch = useAppDispatch();
    const preferences = useAppSelector((s) => s.preferences);
    const dataSourceConfig = useAppSelector((s) => s.dataSourceConfig);
    const { preferenceFilePath, dataSourceConfigPath, dieLayoutXlsPath, stepper, error } = preferences;

    // for the dataSourceConfig (json) file
    const [fileExists, setFileExists] = useState<boolean>(false);
    const [layoutExists, setLayoutExists] = useState<boolean>(false);
    const [modifiedTime, setModifiedTime] = useState<string | null>(null);

    const [dbPath, setDbPath] = useState<string | null>(null);

    // Bin Config States
    const [binConfigModalOpen, setBinConfigModalOpen] = useState(false);
    const [binConfig, setBinConfig] = useState<BinConfigFile | null>(null);
    const [editingBin, setEditingBin] = useState<BinConfig | null>(null);
    const [binFormData, setBinFormData] = useState<{
        binNumber: number | null;
        isGoodBin: boolean;
    }>({
        binNumber: null,
        isGoodBin: false
    });

    // AutoTriggers
    const autoTriggers = useAppSelector(s => s.preferences.autoTriggers);
    const role = useAppSelector(s => s.auth.role);
    const folderDetectTrigger = autoTriggers[AutoTriggers.folderDetection];
    const searchTrigger = autoTriggers[AutoTriggers.search];
    const ingestTrigger = autoTriggers[AutoTriggers.ingest];
    const [loading, setLoading] = useState(false);

    // =========================================================================
    // NOTE: INIT
    // =========================================================================
    useEffect(() => {
        const init = async () => {
            const dir = await appDataDir();
            const path = norm(await resolve(dir, DB_FILENAME));
            setDbPath(path);
            loadBinConfig();
        }
        init();
    }, []);

    const importCSVConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const lines = text.trim().split(/\r?\n/);

            const binValues: BinConfig[] = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                let cols: string[];
                if (line.includes(',')) {
                    cols = line.split(',');
                } else {
                    cols = line.split(/\t/);
                }

                if (cols.length < 1) continue;
                const binNumber = parseInt(cols[0].trim(), 10);
                if (isNaN(binNumber)) continue;
                let isGoodBin = false;
                if (cols.length >= 2 && cols[1] && cols[1].trim()) {
                    const isGoodRaw = cols[1].trim().toLowerCase();
                    isGoodBin = isGoodRaw === '是' || isGoodRaw === 'true' || isGoodRaw === '1' || isGoodRaw === 'yes';
                }
                binValues.push({
                    id: `BIN ${binNumber}`,
                    label: `BIN ${binNumber}`,
                    isGoodBin: isGoodBin,
                    order: binNumber
                });
            }
            if (binValues.length === 0) {
                throw new Error('未找到有效的BIN数据');
            }

            const config: BinConfigFile = {
                binMappingRule: { startNumber: 10, startLetter: 'A' },
                binValues: binValues.sort((a, b) => (a.order || 0) - (b.order || 0))
            };

            setBinConfig(config);
            localStorage.setItem('bin_config', JSON.stringify(config));
            infoToast({
                title: '导入成功',
                message: `已导入 ${binValues.length} 个BIN配置`
            });

            window.dispatchEvent(new CustomEvent('binConfigChanged', { detail: config }));

        } catch (error) {
            errorToast({
                title: '导入失败',
                message: error instanceof Error ? error.message : '文件格式错误'
            });
        }

        event.target.value = '';
    };

    const resetBinConfig = async () => {
        const defaultConfig = {
            binMappingRule: DEFAULT_MAPPING_RULE,
            binValues: DEFAULT_BIN_VALUES_CONFIG
        };
        setBinConfig(defaultConfig);
        localStorage.setItem('bin_config', JSON.stringify(defaultConfig));
        infoToast({
            title: '重置成功',
            message: 'BIN配置已恢复为默认值'
        });
        window.dispatchEvent(new CustomEvent('binConfigChanged', { detail: defaultConfig }));
    };

    const loadBinConfig = () => {
        const saved = localStorage.getItem('bin_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            setBinConfig(parsed);
        } else {
            setBinConfig({
                binMappingRule: DEFAULT_MAPPING_RULE,
                binValues: DEFAULT_BIN_VALUES_CONFIG
            });
        }
    };

    const handleSaveBin = () => {
        if (!binConfig) return;

        if (!binFormData.binNumber) {
            errorToast({ title: '验证失败', message: '请填写BIN数字' });
            return;
        }

        const binNumber = binFormData.binNumber;
        const binId = `BIN ${binNumber}`;

        if (!editingBin) {
            const exists = binConfig.binValues.some(b => b.id === binId);
            if (exists) {
                errorToast({ title: '验证失败', message: `BIN ${binNumber} 已存在` });
                return;
            }
        }

        const newBin: BinConfig = {
            id: binId,
            label: binId,
            isGoodBin: binFormData.isGoodBin,
            order: binNumber
        };

        let newBinValues: BinConfig[];
        if (editingBin) {
            const index = binConfig.binValues.findIndex(b => b.id === editingBin.id);
            if (index !== -1) {
                newBinValues = [...binConfig.binValues];
                newBinValues[index] = newBin;
                newBinValues = newBinValues.sort((a, b) => (a.order || 0) - (b.order || 0));
            } else {
                newBinValues = binConfig.binValues;
            }
        } else {
            newBinValues = [...binConfig.binValues, newBin];
            newBinValues = newBinValues.sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        const updatedConfig = { ...binConfig, binValues: newBinValues };
        setBinConfig(updatedConfig);
        localStorage.setItem('bin_config', JSON.stringify(updatedConfig));
        window.dispatchEvent(new CustomEvent('binConfigChanged', { detail: updatedConfig }));

        setBinConfigModalOpen(false);
        resetBinForm();
    };

    const handleDeleteBin = (binId: string) => {
        if (!binConfig) return;

        const newBinValues = binConfig.binValues.filter(b => b.id !== binId);
        const updatedConfig = { ...binConfig, binValues: newBinValues };
        setBinConfig(updatedConfig);
        localStorage.setItem('bin_config', JSON.stringify(updatedConfig));
        window.dispatchEvent(new CustomEvent('binConfigChanged', { detail: updatedConfig }));
    };

    const resetBinForm = () => {
        setEditingBin(null);
        setBinFormData({
            binNumber: null,
            isGoodBin: false
        });
    };

    const handleEditBin = (bin: BinConfig) => {
        const binNumber = parseInt(bin.id.replace('BIN ', ''), 10);
        setEditingBin(bin);
        setBinFormData({
            binNumber: binNumber,
            isGoodBin: bin.isGoodBin
        });
        setBinConfigModalOpen(true);
    };

    const updateMappingRule = (field: keyof BinMappingRule, value: number | string) => {
        if (!binConfig) return;
        const updatedConfig = {
            ...binConfig,
            binMappingRule: {
                ...binConfig.binMappingRule,
                [field]: value
            }
        };
        setBinConfig(updatedConfig);
        localStorage.setItem('bin_config', JSON.stringify(updatedConfig));
        window.dispatchEvent(new CustomEvent('binConfigChanged', { detail: updatedConfig }));
    };

    // =========================================================================
    // NOTE: METHODS
    // =========================================================================
    const handlePrefReset = async () => {
        setLoading(true);
        try {
            await dispatch(resetPreferencesToDefault());
            await dispatch(initPreferences());
            infoToast({ title: '初始化完成', message: '已重置通用设置为默认值。' });
        } catch (err) {
            errorToast({ title: '初始化失败', message: String(err) });
        } finally {
            setLoading(false);
        }
    }

    const handleDataSourcePathReset = async () => {
        setLoading(true);
        try {
            // Reset the entire data source config to defaults and clear folder state
            await dispatch(resetDataSourceConfigToDefault());
            await dispatch(resetFolders());
            infoToast({ title: '初始化完成', message: '已重置数据源配置与子目录列表。' });
        } catch (err) {
            errorToast({ title: '初始化失败', message: String(err) });
        } finally {
            setLoading(false);
        }
    };

    // For the auto triggers
    const handleToggleFolderDetect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        await dispatch(
            setAutoTriggerState({ target: AutoTriggers.folderDetection, value: event.currentTarget.checked })
        )
    }
    const handleToggleSearchDetect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        await dispatch(
            setAutoTriggerState({ target: AutoTriggers.search, value: event.currentTarget.checked })
        )
    }
    const handleToggleIngestDetect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        await dispatch(
            setAutoTriggerState({ target: AutoTriggers.ingest, value: event.currentTarget.checked })
        )
    }

    // =========================================================================
    // NOTE: REACT
    // =========================================================================
    useEffect(() => {
        let mounted = true;
        // Check the data source config path every time its value changes
        // NOTE: Updates stepper state
        // NOTE: Optimization available to PREVENT reading the stat of data source config file twice
        async function check() {
            if (!dataSourceConfigPath) {
                setFileExists(false);
                setModifiedTime(null);
                return;
            }
            try {
                const existsFlag = await exists(dataSourceConfigPath);
                if (!mounted) return;
                setFileExists(existsFlag);
                if (existsFlag) {
                    const info = await stat(dataSourceConfigPath);
                    if (!mounted) return;
                    setModifiedTime(info.mtime ? new Date(info.mtime).toLocaleString() : null);
                } else {
                    setModifiedTime(null);
                }
            } catch {
                if (mounted) {
                    setFileExists(false);
                    setModifiedTime(null);
                    return;
                }
            }
            await dispatch(revalidatePreferencesFile());
        }

        check();

        return () => {
            mounted = false;
        };
    }, [dataSourceConfigPath, stepper]);

    useEffect(() => {
        let mounted = true;
        async function checkLayout() {
            if (!dieLayoutXlsPath) {
                setLayoutExists(false);
                return;
            }
            try {
                const ok = await exists(dieLayoutXlsPath);
                if (mounted) setLayoutExists(ok);
            } catch {
                if (mounted) setLayoutExists(false);
            }
        }
        checkLayout();
        return () => { mounted = false; };
    }, [dieLayoutXlsPath]);

    return (
        <Stack gap="lg">
            <Group grow align="flex-start">
                <Stack>
                    <Title order={2}>通用</Title>
                    <PathPicker
                        label=""
                        value={preferenceFilePath || ''}
                        disabled
                        onChange={() => { }}
                        variant="filled"
                        withAsterisk={false}
                        mode="file"
                    />
                    <Group>
                        <Tooltip label="从磁盘读取并加载当前设置" withArrow>
                            <Button variant="light" onClick={() => dispatch(initPreferences())} disabled={loading}>
                                加载
                            </Button>
                        </Tooltip>
                        <Tooltip label="将通用设置恢复为默认值（会覆盖当前设置）" withArrow>
                            <Button variant="light" color="red" onClick={handlePrefReset} disabled={loading}>
                                初始化
                            </Button>
                        </Tooltip>
                    </Group>
                </Stack>

                <Stack>
                    <Title order={2}>数据库</Title>
                    <PathPicker
                        label=""
                        value={dbPath || ''}
                        disabled
                        onChange={() => { }}
                        variant="filled"
                        withAsterisk={false}
                        mode="file"
                    />
                    <Group>
                        <Button variant="light" onClick={() => navigate('/db/data/more')} disabled={loading}>
                            数据库设置
                        </Button>
                    </Group>
                </Stack>
            </Group>

            <Divider />

            <Title order={2}>自动</Title>
            <Group>
                <Switch
                    withThumbIndicator={false}
                    label="子目录识别"
                    size="lg"
                    onLabel="自动"
                    offLabel="手动"
                    checked={folderDetectTrigger}
                    onChange={handleToggleFolderDetect}
                    disabled={!IS_DEV && role !== AuthRole.Admin}
                />
                <Switch
                    withThumbIndicator={false}
                    label="读取元数据"
                    size="lg"
                    onLabel="自动"
                    offLabel="手动"
                    checked={searchTrigger}
                    onChange={handleToggleSearchDetect}
                />
                <Switch
                    withThumbIndicator={false}
                    label="加载与维护数据库"
                    size="lg"
                    onLabel="自动"
                    offLabel="手动"
                    checked={ingestTrigger}
                    onChange={handleToggleIngestDetect}
                />
            </Group>

            <Divider />

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="xl">
                <Stack gap="xs">
                    <Title order={2}>数据源配置文件</Title>
                    <Stack gap="xs">
                        <PathPicker
                            label="数据源配置文件路径(.json)"
                            value={dataSourceConfigPath || ''}
                            onChange={(e) => dispatch(setDataSourceConfigPath(e))}
                            mode="file"
                        />
                        <Group gap="sm">
                            {loading && <Text c="dimmed">初始化中...</Text>}
                            {error && <Text c="red">错误: {error}</Text>}
                            {fileExists ? (
                                <Badge color="green" leftSection={<IconCheck size={12} />}>存在</Badge>
                            ) : (
                                <Badge color="red" leftSection={<IconX size={12} />}>不存在</Badge>
                            )}
                            {modifiedTime && <Text size="sm">最后修改: {modifiedTime}</Text>}
                        </Group>
                    </Stack>
                    <Group>
                        <Tooltip label="将数据源配置与子目录列表重置为默认值" withArrow>
                            <Button variant="light" color="red" onClick={handleDataSourcePathReset} disabled={loading}>
                                初始化
                            </Button>
                        </Tooltip>
                    </Group>
                </Stack>

                <Stack gap="xs">
                    <Title order={2}>基板布局 Excel</Title>
                    <Stack gap="xs">
                        <PathPicker
                            label="基板布局 Excel 文件"
                            value={dieLayoutXlsPath || ''}
                            onChange={(e) => dispatch(setDieLayoutXlsPath(e))}
                            mode="file"
                        />
                        <Group gap="sm">
                            {layoutExists ? (
                                <Badge color="green" leftSection={<IconCheck size={12} />}>存在</Badge>
                            ) : (
                                <Badge color="red" leftSection={<IconX size={12} />}>不存在</Badge>
                            )}
                        </Group>
                    </Stack>
                </Stack>
            </SimpleGrid>

            <Divider />
            {/* BIN配置管理 */}
            <Stack gap="xs">
                <Group justify="space-between">
                    <Title order={2}>BIN配置管理</Title>
                    <Group>
                        <Button
                            variant="light"
                            color="green"
                            leftSection={<IconPlus size={16} />}
                            onClick={() => {
                                setEditingBin(null);
                                setBinFormData({
                                    binNumber: null,
                                    isGoodBin: false
                                });
                                setBinConfigModalOpen(true);
                            }}
                        >
                            添加BIN
                        </Button>
                        <Button
                            variant="light"
                            color="red"
                            onClick={resetBinConfig}
                        >
                            重置默认
                        </Button>
                        <Button
                            variant="light"
                            leftSection={<IconUpload size={16} />}
                            component="label"
                        >
                            导入CSV
                            <input
                                type="file"
                                accept=".csv,.txt"
                                hidden
                                onChange={importCSVConfig}
                            />
                        </Button>
                    </Group>
                </Group>

                <Alert color="blue" title="数字到字母映射规则">
                    <Group>
                        <Text>起始数字：</Text>
                        <NumberInput
                            value={binConfig?.binMappingRule.startNumber || 10}
                            onChange={(val) => updateMappingRule('startNumber', Number(val))}
                            min={1}
                            max={100}
                            style={{ width: 100 }}
                        />
                        <Text>起始字母：</Text>
                        <TextInput
                            value={binConfig?.binMappingRule.startLetter || 'A'}
                            onChange={(e) => updateMappingRule('startLetter', e.target.value.toUpperCase())}
                            style={{ width: 80 }}
                            maxLength={1}
                        />
                        <Text>示例：{binConfig?.binMappingRule.startNumber} → {binConfig?.binMappingRule.startLetter}</Text>
                    </Group>
                </Alert>

                {binConfig && (
                    <ScrollArea h={300}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>BIN ID</Table.Th>
                                    <Table.Th>类型</Table.Th>
                                    <Table.Th>操作</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {binConfig.binValues.map((bin) => (
                                    <Table.Tr key={bin.id}>
                                        <Table.Td>{bin.id}</Table.Td>
                                        <Table.Td>
                                            {bin.isGoodBin ? (
                                                <Badge color="green">Good Bin</Badge>
                                            ) : (
                                                <Badge color="gray">Bad Bin</Badge>
                                            )}
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <ActionIcon
                                                    color="blue"
                                                    onClick={() => handleEditBin(bin)}
                                                >
                                                    <IconEdit size={16} />
                                                </ActionIcon>
                                                <ActionIcon
                                                    color="red"
                                                    onClick={() => handleDeleteBin(bin.id)}
                                                >
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                )}
            </Stack>
            <Divider />
            <Title order={2}>配置文件浏览</Title>
            <Title order={3}>通用设置</Title>
            {preferences ? (
                <ScrollArea>
                    <JsonCode value={prepPreferenceWriteOut(preferences)} />
                </ScrollArea>
            ) : (
                <Text>无信息</Text>
            )}
            <Title order={3}>数据源设置</Title>
            {dataSourceConfig ? (
                <ScrollArea>
                    <JsonCode value={dataSourceConfig} />
                </ScrollArea>
            ) : (
                <Text>无信息</Text>
            )}
            <Modal
                opened={binConfigModalOpen}
                onClose={() => {
                    setBinConfigModalOpen(false);
                    resetBinForm();
                }}
                title={editingBin ? '编辑BIN' : '添加BIN'}
            >
                <Stack>
                    <NumberInput
                        label="BIN数字"
                        placeholder="例如: 21"
                        value={binFormData.binNumber || undefined}
                        onChange={(val) => setBinFormData({ ...binFormData, binNumber: val !== '' ? Number(val) : null })}
                        required
                        description="输入数字，10以上会自动映射为字母"
                    />

                    {binFormData.binNumber && (
                        <Text size="sm" c="dimmed">
                            将创建: BIN {binFormData.binNumber} → 显示为 {binFormData.binNumber >= (binConfig?.binMappingRule.startNumber || 10)
                                ? String.fromCharCode((binConfig?.binMappingRule.startLetter || 'A').charCodeAt(0) + binFormData.binNumber - (binConfig?.binMappingRule.startNumber || 10))
                                : binFormData.binNumber}
                        </Text>
                    )}

                    <Switch
                        label="Good Bin"
                        checked={binFormData.isGoodBin}
                        onChange={(e) => setBinFormData({ ...binFormData, isGoodBin: e.target.checked })}
                    />

                    <Group justify="flex-end">
                        <Button variant="outline" onClick={() => {
                            setBinConfigModalOpen(false);
                            resetBinForm();
                        }}>
                            取消
                        </Button>
                        <Button onClick={handleSaveBin}>
                            保存
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}