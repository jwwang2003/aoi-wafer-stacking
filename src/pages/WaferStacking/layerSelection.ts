export interface SelectableWaferMap {
    stage: string | null | undefined;
    sub_stage: string | null | undefined;
}

export const waferMapLayerKey = (wm: SelectableWaferMap): string =>
    `${String(wm.stage ?? '').toLowerCase()}|${wm.sub_stage == null ? '' : String(wm.sub_stage)}`;

export const buildSelectedLayerKeySet = (
    waferMaps: SelectableWaferMap[],
    selectedLayerKeys: string[] | undefined
): Set<string> => {
    const candidateKeys = new Set(waferMaps.map(waferMapLayerKey));
    const requestedKeys = selectedLayerKeys === undefined
        ? Array.from(candidateKeys)
        : selectedLayerKeys;

    return new Set(requestedKeys.map(String).filter((key) => candidateKeys.has(key)));
};
