use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WeightStatus {
    pub cpu_path: Option<String>,
    pub gpu_path: Option<String>,
    pub available: Vec<WeightInfo>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatus {
    pub gpu_available: bool,
    pub gpu_count: usize,
    pub prefer_gpu: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InferenceStatus {
    pub device: DeviceStatus,
    pub weights: WeightStatus,
    pub libtorch_enabled: bool,
}

// Stub-only payload mirrors real backend input; suppress dead_code warnings in libtorch-disabled builds.
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceImagePayload {
    pub name: String,
    pub data: Vec<u8>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceRequest {
    pub images: Vec<InferenceImagePayload>,
    pub prefer_gpu: Option<bool>,
    pub cpu_weight_path: Option<String>,
    pub gpu_weight_path: Option<String>,
    pub preview_values: Option<usize>,
    pub resize: Option<ResizeConfig>,
    pub mask_threshold: Option<f32>,
    pub detect_enabled: Option<bool>,
    pub detect_prefer_gpu: Option<bool>,
    pub detect_weight_path: Option<String>,
    pub detect_threshold: Option<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceOutputPreview {
    pub values: Vec<f32>,
    pub total_values: usize,
    pub shape: Vec<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaskData {
    pub width: i64,
    pub height: i64,
    pub data: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectionBox {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub score: f32,
    pub class_id: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectionResult {
    pub model_path: String,
    pub device: String,
    pub boxes: Vec<DetectionBox>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceSampleResult {
    pub name: String,
    pub duration_ms: u128,
    pub width: i64,
    pub height: i64,
    pub channels: i64,
    pub device: String,
    pub preview: InferenceOutputPreview,
    pub mask: Option<MaskData>,
    pub detection: Option<DetectionResult>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceFailure {
    pub name: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendInfo {
    pub device: String,
    pub gpu: bool,
    pub gpu_count: usize,
    pub model_path: String,
    pub weights: WeightStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceBatchResult {
    pub backend: BackendInfo,
    pub results: Vec<InferenceSampleResult>,
    pub errors: Vec<InferenceFailure>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct ResizeConfig {
    pub width: i64,
    pub height: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WeightInfo {
    pub model: String,
    pub device: String,
    pub format: String,
    pub path: String,
    pub extension: String,
}

pub fn inference_status() -> InferenceStatus {
    InferenceStatus {
        device: DeviceStatus {
            gpu_available: false,
            gpu_count: 0,
            prefer_gpu: false,
        },
        weights: WeightStatus {
            cpu_path: None,
            gpu_path: None,
            available: Vec::new(),
        },
        libtorch_enabled: false,
    }
}

pub fn run_inference(_req: InferenceRequest) -> Result<InferenceBatchResult, String> {
    Err("This build was compiled without libtorch support.".to_string())
}
