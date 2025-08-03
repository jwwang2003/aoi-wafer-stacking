// 设置和数据源配置的stepper
export enum ConfigStepperState {
    Initial = -1,
    ConfigInfo = 0,       // 配置信息 - 读取配置信息里的持久化内容
    RootDirectory = 1,    // 根目录 - 根目录路径有效
    Subdirectories = 2,   // 子目录 - 成功配置各个谁的数据源（子目录）
    DeviceData = 3        // 设备数据 - 读取设备信息
}