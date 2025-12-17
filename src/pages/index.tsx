import { lazy } from 'react';

// Code-split top-level pages to create separate chunks
const Welcome = lazy(() => import('./Welcome'));
const Config = lazy(() => import('./Config'));
const WaferStacking = lazy(() => import('./WaferStacking'));
const Database = lazy(() => import('./Database'));
const Log = lazy(() => import('./Log'));
const About = lazy(() => import('./About'));
const ComingSoon = lazy(() => import('./ComingSoon'));
const Admin = lazy(() => import('./Admin'));
const Aoi = lazy(() => import('./Aoi'));

export {
    Welcome,
    Config,
    WaferStacking,
    Database,
    Log,
    About,
    ComingSoon,
    Admin,
    Aoi,
}
