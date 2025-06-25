import React, { useState } from 'react';
import { Group, Box, Flex, Button, Tooltip } from '@mantine/core';
import { 
  IconHome, 
  IconSettings, 
  IconDisc,
  IconEyeSearch,
  IconDatabase,
  IconHelpCircle,
  IconInfoCircle
} from '@tabler/icons-react';

import {
  Config as ConfigPage, 
  WaferStacking as WaferStackingPage,
  About as AboutPage
} from "@/pages";

type Mode = 'home' | 'config' | 'aoi' | 'wafer' | 'db' | 'help' | 'about';

export default function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [hovered, setHovered] = useState<Mode | null>(null);

  const renderContent = () => {
    switch (mode) {
      case 'home':   return <div>Welcome to the Home page.</div>;
      case 'config': return <ConfigPage />;
      case 'aoi':    return <div>AOI (Automated Optical Inspection) content goes here.</div>;
      case 'wafer':  return <WaferStackingPage />;
      case 'help':   return <div>Need help? Find FAQs and support here.</div>;
      case 'about':  return <AboutPage />;
      default:       return <div>未找到内容</div>;
    }
  };

  const menuItems: { icon: React.FC<any>; label: string; value: Mode }[] = [
    { icon: IconHome,       label: '主页',  value: 'home'   },
    { icon: IconSettings,   label: '配置',  value: 'config' },
    { icon: IconEyeSearch,  label: 'AOI',   value: 'aoi'    },
    { icon: IconDisc,       label: '叠图',  value: 'wafer'  },
    { icon: IconDatabase,   label: '数据库', value: 'db'    },
    { icon: IconHelpCircle, label: '帮助',  value: 'help'   },
    { icon: IconInfoCircle, label: '关于',  value: 'about'  },
  ];

  // split into top 3 and bottom 2
  const topItems = menuItems.slice(0, 5);
  const bottomItems = menuItems.slice(5);

  return (
    <div style={{ position: 'relative', height: '100vh', display: 'flex', overflow: 'hidden' }}>
      {/* Left sidebar */}
      <Box
        p="md"
        style={{
          width: 50,
          borderRight: '1px solid #eaeaea',
          display: 'flex',
          top: 0,
          left: 0,
          height: '100vh',
          position: 'sticky',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* Top group */}
        <Flex direction="column" align="center" gap="md">
          {topItems.map(({ icon: Icon, label, value }) => {
            const isActive = mode === value;
            const isHovered = hovered === value;
            return (
              <Tooltip key={value} label={label} position="right">
                <Button
                  aria-label={label}
                  variant={isActive ? 'filled' : 'outline'}
                  onClick={() => setMode(value)}
                  onMouseEnter={() => setHovered(value)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    width: 35,
                    height: 35,
                    padding: 0,
                    transition: 'transform 150ms ease',
                    transform: isHovered ? 'scale(1.075)' : 'scale(1)',
                  }}
                >
                  <Icon size={20} strokeWidth={2} />
                </Button>
              </Tooltip>
            );
          })}
        </Flex>

        {/* Bottom group */}
        <Flex direction="column" align="center" gap="md">
          {bottomItems.map(({ icon: Icon, label, value }) => {
            const isActive = mode === value;
            const isHovered = hovered === value;
            return (
              <Tooltip key={value} label={label} position="right">
                <Button
                  aria-label={label}
                  variant={isActive ? 'filled' : 'outline'}
                  onClick={() => setMode(value)}
                  onMouseEnter={() => setHovered(value)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    width: 35,
                    height: 35,
                    padding: 0,
                    transition: 'transform 150ms ease',
                    transform: isHovered ? 'scale(1.075)' : 'scale(1)',
                  }}
                >
                  <Icon size={20} strokeWidth={2} />
                </Button>
              </Tooltip>
            );
          })}
        </Flex>
      </Box>

      {/* Main content */}
      <Box flex={1} style={{ overflow: 'scroll' }}>
        {renderContent()}
      </Box>
    </div>
  );
}
