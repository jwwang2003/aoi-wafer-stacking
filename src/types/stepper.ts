// 设置和数据源配置的stepper
export enum ConfigStepperState {
    Initial = -1,
    ConfigInfo = 0,       // 配置信息 - 读取配置信息里的持久化内容
    Subdirectories = 1,   // 子目录 - 成功配置各个谁的数据源（子目录）
    Metadata = 2,
    Database = 3,
}
