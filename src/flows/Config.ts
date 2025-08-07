import { initPreferences } from '@/slices/preferencesSlice';

export const ConfigFlow: Array<() => unknown> = [
    initPreferences,
    
]