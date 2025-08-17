import { useAppDispatch, useAppSelector } from "@/hooks";
import { setAutoTriggerState } from "@/slices/preferencesSlice";
import { AutoTriggers } from "@/types/preferences";
import { Switch } from "@mantine/core";

const names: { [K in AutoTriggers]: string } = {
    'folderDetection': '子目录识别',
    'search': '探索数据源',
    'ingest': '数据摄取'
}

export default function AutoTriggerSwitch({ type }: { type: AutoTriggers }) {
    const dispatch = useAppDispatch();
    const trigger = useAppSelector(s => s.preferences.autoTriggers[type]);
    const handleSetTrigger = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const { checked } = e.currentTarget;
        return await dispatch(setAutoTriggerState({ target: type, value: checked }));
    }

    return (
        <Switch
            withThumbIndicator={false}
            label={names[type]}
            size="lg"
            onLabel="自动"
            offLabel="手动"
            checked={trigger}
            onChange={handleSetTrigger}
        />
    );
}