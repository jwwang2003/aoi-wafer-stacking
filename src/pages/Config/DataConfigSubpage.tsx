import { useEffect, useState } from 'react';
import { Indicator, Group, Stack, Stepper, Chip, Button, Title, Text, Divider } from '@mantine/core';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  setRootPath,
  setSubstratePaths,
  setFabCpPaths,
  setCp1Paths,
  setWlbiPaths,
  setCp2Paths,
  setAoiPaths,
  setRegexPattern,
  saveConfig,
} from '@/slices/configSlice';
import { RegexInput } from '@/components/RegexInput';
import SubFolderInput from '@/components/FolderSelect';
import DirectorySelectList from '@/components/DirectorySelectList';

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
  const rootDirty = rootLastModified > lastSaved;
  const regexDirty = regexLastModified > lastSaved;
  const pathsDirty = pathsLastModified > lastSaved;

  // Regex patterns from Redux
  const regexPatterns = useAppSelector((state) => state.config.regex);

  // Edit handlers
  const handleRegexChange = (newPattern: string, key: keyof typeof regexPatterns) => {
    dispatch(setRegexPattern({ key, regex: newPattern }));
  };

  const [active, setActive] = useState(1);
  const [rootFolderStageOptions, setRootFolderStageOptions] = useState<string[]>(['auto']);

  useEffect(() => {
    // e.g. logging
  }, [rootFolderStageOptions]);

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
            <RegexInput
              label="文件名正则"
              defaultRegex={regexPatterns.substrateRegex}
              onValidChange={(r) => handleRegexChange(r, 'substrateRegex')}
            />
            <RegexInput
              label="FAB CP文件名正则"
              defaultRegex={regexPatterns.fabCpRegex}
              onValidChange={(r) => handleRegexChange(r, 'fabCpRegex')}
            />
            <RegexInput
              label="CP1文件名正则"
              defaultRegex={regexPatterns.cp1Regex}
              onValidChange={(r) => handleRegexChange(r, 'cp1Regex')}
            />
            <RegexInput
              label="WLBI文件名正则"
              defaultRegex={regexPatterns.wlbiRegex}
              onValidChange={(r) => handleRegexChange(r, 'wlbiRegex')}
            />
            <RegexInput
              label="CP2文件名正则"
              defaultRegex={regexPatterns.cp2Regex}
              onValidChange={(r) => handleRegexChange(r, 'cp2Regex')}
            />
            <RegexInput
              label="AOI文件名正则"
              defaultRegex={regexPatterns.aoiRegex}
              onValidChange={(r) => handleRegexChange(r, 'aoiRegex')}
            />
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
        <SubfolderSelectorSection
          title="衬底 (substrate)"
          paths={useAppSelector((s) => s.config.paths.substratePaths)}
          onChange={(ps) => dispatch(setSubstratePaths(ps))}
        />
        <SubfolderSelectorSection
          title="FAB CP"
          paths={useAppSelector((s) => s.config.paths.fabCpPaths)}
          onChange={(ps) => dispatch(setFabCpPaths(ps))}
        />
        <SubfolderSelectorSection
          title="CP1"
          paths={useAppSelector((s) => s.config.paths.cp1Paths)}
          onChange={(ps) => dispatch(setCp1Paths(ps))}
        />
        <SubfolderSelectorSection
          title="WLBI"
          paths={useAppSelector((s) => s.config.paths.wlbiPaths)}
          onChange={(ps) => dispatch(setWlbiPaths(ps))}
        />
        <SubfolderSelectorSection
          title="CP2"
          paths={useAppSelector((s) => s.config.paths.cp2Paths)}
          onChange={(ps) => dispatch(setCp2Paths(ps))}
        />
        <SubfolderSelectorSection
          title="AOI"
          paths={useAppSelector((s) => s.config.paths.aoiPaths)}
          onChange={(ps) => dispatch(setAoiPaths(ps))}
        />
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