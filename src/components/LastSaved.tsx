import { Group, Stack, Text } from '@mantine/core';

interface LastSavedSectionProps {
    dirty: boolean;
    lastModified: string;
    lastSaved: string;
}

export default function LastSavedSection({
    dirty,
    lastModified,
    lastSaved,
    // onSave,
    // label = "保存",
}: LastSavedSectionProps) {
    return (
        <Group align="flex-start">
            {/* <Indicator color="blue" withBorder disabled={!dirty}>
                <Button color={dirty ? "green" : undefined} onClick={onSave}>
                    {label}
                </Button>
            </Indicator> */}
            <Stack gap={0} style={{ lineHeight: 1.2 }}>
                <Text size="xs" c="dimmed">
                    最后修改: {new Date(lastModified).toLocaleString()}
                </Text>
                <Text size="sm" c={dirty ? 'green' : undefined}>
                    最后保存: {new Date(lastSaved).toLocaleString()}
                </Text>
            </Stack>
        </Group>
    );
}