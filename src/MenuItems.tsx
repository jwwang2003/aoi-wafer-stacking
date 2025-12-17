import {
    IconHome,
    IconSettings,
    IconEyeSearch,
    IconDatabase,
    IconHelpCircle,
    IconInfoCircle,
    IconMessage2,
    IconStack3,
    IconUserShield,
} from '@tabler/icons-react';

import {
    Welcome as WelcomePage,
    Config as ConfigPage,
    WaferStacking as WaferStackingPage,
    Database as DatabasePage,
    Log as LogPage,
    About as AboutPage,
    ComingSoon,
    Admin as AdminPage,
    Aoi as AoiPage,
} from '@/pages';

export type Mode = 'home' | 'config' | 'aoi' | 'wafer' | 'db' | 'log' | 'help' | 'about' | 'admin';

export interface MenuItem {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: React.FC<any>;
    label: string;
    value: Mode;
    path: string;
    component: React.FC; // Functional component for routing
}

const menuItems: MenuItem[] = [
    {
        icon: IconHome,
        label: '主页',
        value: 'home',
        path: '/',
        component: WelcomePage,
    },
    {
        icon: IconSettings,
        label: '配置',
        value: 'config',
        path: '/config',
        component: ConfigPage,
    },
    {
        icon: IconDatabase,
        label: '数据库',
        value: 'db',
        path: '/db',
        component: DatabasePage,
    },
    {
        icon: IconEyeSearch,
        label: 'AOI',
        value: 'aoi',
        path: '/aoi',
        component: AoiPage,
    },
    {
        icon: IconStack3,
        label: '叠图',
        value: 'wafer',
        path: '/wafer',
        component: WaferStackingPage,
    },
    {
        icon: IconMessage2,
        label: '日志',
        value: 'log',
        path: '/log',
        component: LogPage,
    },
    {
        icon: IconHelpCircle,
        label: '帮助',
        value: 'help',
        path: '/help',
        component: ComingSoon,
    },
    {
        icon: IconInfoCircle,
        label: '关于',
        value: 'about',
        path: '/about',
        component: AboutPage,
    },
    {
        icon: IconUserShield,
        label: '管理',
        value: 'admin',
        path: '/admin',
        component: AdminPage,
    },
];

export default menuItems;
