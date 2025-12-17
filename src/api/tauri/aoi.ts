import { invokeSafe } from './index';
import type {
    AoiInferenceBatchResult,
    AoiInferenceStatus,
    AoiResizeConfig,
} from '@/types/ipc';

export interface AoiInferenceImage {
    name: string;
    data: Uint8Array;
}

export interface RunAoiInferenceArgs {
    images: AoiInferenceImage[];
    preferGpu?: boolean;
    cpuWeightPath?: string;
    gpuWeightPath?: string;
    segmentationEnabled?: boolean;
    previewValues?: number;
    resize?: AoiResizeConfig;
    maskThreshold?: number;
    detectEnabled?: boolean;
    detectPreferGpu?: boolean;
    detectWeightPath?: string;
    detectThreshold?: number;
}

export async function fetchAoiInferenceStatus(): Promise<AoiInferenceStatus> {
    return invokeSafe('rust_aoi_inference_status');
}

export async function runAoiInference(
    args: RunAoiInferenceArgs
): Promise<AoiInferenceBatchResult> {
    const payload = {
        req: {
            images: args.images,
            preferGpu: args.preferGpu,
            cpuWeightPath: args.cpuWeightPath,
            gpuWeightPath: args.gpuWeightPath,
            segmentationEnabled: args.segmentationEnabled,
            previewValues: args.previewValues,
            resize: args.resize,
            maskThreshold: args.maskThreshold,
            detectEnabled: args.detectEnabled,
            detectPreferGpu: args.detectPreferGpu,
            detectWeightPath: args.detectWeightPath,
            detectThreshold: args.detectThreshold,
        },
    };
    return invokeSafe('rust_aoi_run_inference', payload);
}
