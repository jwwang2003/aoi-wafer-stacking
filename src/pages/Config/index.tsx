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
    getBreakpointValue,
} from '@mantine/core';

// Subpages
import UserPreferencesSubpage from './UserPreferencesSubpage';
import DataConfigSubpage from './DataConfigSubpage';
import SubstrateConfigPage from './SubstrateConfigSubpage';


export default function ConfigPage() {
    const [selectedOption, setSelectedOption] = useState<string>('数据源');

    // Handle SegmentedControl change
    const handleSegmentedControlChange = (value: string) => {
        setSelectedOption(value);
    };

    let componentToDisplay;

    // Switch case based on selectedOption
    switch (selectedOption) {
        case '通用':
            componentToDisplay = <UserPreferencesSubpage />;
            break;
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
                        data={['通用', '数据源', '衬底配置']}
                        value={selectedOption}
                        onChange={handleSegmentedControlChange}
                    />
                    {componentToDisplay} {/* Render the selected component */}
                </Stack>
            </Container>
        </Group>
    );
}