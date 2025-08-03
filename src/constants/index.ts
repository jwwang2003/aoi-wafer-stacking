// Default values (constants) are defined here
import { BaseDirectory } from '@tauri-apps/plugin-fs';

export const baseDir = BaseDirectory.AppData;

// The path for user preferences must stay constant! (other paths can be reconfigured & saved in the user pref.)
// All of these files should reside in the appdata directory by default!
export const PREFERENCES_FILENAME = 'preferences.json'              // Preferences & settings
export const DATA_SOURCES_CONFIG_FILENAME = 'data_sources.json'     // Data sources (wafer信息的文件路径)
export const DB_FILENAME = 'storage.db'                             // TODO: