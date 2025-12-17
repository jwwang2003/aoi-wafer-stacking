use once_cell::sync::Lazy;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    convert::TryInto,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Instant,
};
use tch::{vision::image, CModule, Cuda, Device, IndexOp, Kind, QEngine, Tensor, IValue};

const CPU_WEIGHT_NAME: &str = "aoi_cpu.ts";
const GPU_WEIGHT_NAME: &str = "aoi_gpu.ts";
const MIN_INPUT_FALLBACK: i64 = 608;
const DETECTION_STRIDE_FALLBACK: i64 = 32;
const DETECTION_MIN_SIDE: i64 = 640;
const DETECTION_IOU_THRESHOLD: f32 = 0.45;

// Regex-friendly filename patterns we will consider when auto-discovering weights.
// Supported examples (CPU):
//   attention_r2unet_cpu_fp32.ts
//   attention_r2unet_cpu_int8.ts
// Supported examples (GPU):
//   attention_r2unet_gpu_fp16.ts
//   attention_r2unet_gpu_fp32.ts
//   attention_r2unet_inference_fp16.pt (treated as GPU/FP16)
//   attention_r2unet_inference_fp32.pt (treated as GPU/FP32)
const CPU_WEIGHT_REGEX: &str = r"(?i)attention_r2unet_cpu_(fp32|int8)\.(ts|pt|torchscript)$";
const GPU_WEIGHT_REGEX: &str = r"(?i)attention_r2unet_(gpu_(fp16|fp32)\.(ts|torchscript)|inference_fp(16|32)\.(pt|torchscript))$";
const DETECTION_WEIGHT_REGEX: &str = r"(?i)^(?P<model>yolo.*)_(?P<device>cpu|gpu|inference)_(?P<format>fp32|fp16|int8)\.(?P<ext>ts|pt|torchscript)$";

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceImagePayload {
    pub name: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceRequest {
    pub images: Vec<InferenceImagePayload>,
    pub prefer_gpu: Option<bool>,
    pub cpu_weight_path: Option<String>,
    pub gpu_weight_path: Option<String>,
    pub segmentation_enabled: Option<bool>,
    pub preview_values: Option<usize>,
    pub resize: Option<ResizeConfig>,
    pub mask_threshold: Option<f32>,
    pub detect_enabled: Option<bool>,
    pub detect_prefer_gpu: Option<bool>,
    pub detect_weight_path: Option<String>,
    pub detect_threshold: Option<f32>,
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

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct ResizeConfig {
    pub width: i64,
    pub height: i64,
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
    pub input_shape: Vec<i64>,
    pub pad: [i64; 4],
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

#[derive(Clone)]
struct CachedModel {
    path: PathBuf,
    model: Arc<Mutex<CModule>>,
}

#[derive(Default)]
struct ModelCache {
    cpu: Option<CachedModel>,
    gpu: Option<CachedModel>,
}

static MODEL_CACHE: Lazy<Mutex<ModelCache>> = Lazy::new(|| Mutex::new(ModelCache::default()));

pub fn inference_status() -> InferenceStatus {
    let gpu_available = Cuda::is_available();
    let gpu_count = if gpu_available {
        Cuda::device_count()
    } else {
        0
    } as usize;
    InferenceStatus {
        device: DeviceStatus {
            gpu_available,
            gpu_count,
            prefer_gpu: gpu_available,
        },
        weights: WeightStatus {
            cpu_path: locate_weight(CPU_WEIGHT_NAME)
                .as_deref()
                .map(path_to_string),
            gpu_path: locate_weight(GPU_WEIGHT_NAME)
                .as_deref()
                .map(path_to_string),
            available: discover_weights(),
        },
        libtorch_enabled: true,
    }
}

pub fn run_inference(req: InferenceRequest) -> Result<InferenceBatchResult, String> {
    if req.images.is_empty() {
        return Err("No images provided for inference".into());
    }

    let preview_len = req.preview_values.unwrap_or(16).clamp(1, 64);
    let prefer_gpu = req.prefer_gpu.unwrap_or(true);
    let segmentation_enabled = req.segmentation_enabled.unwrap_or(true);
    let mask_threshold = req.mask_threshold.unwrap_or(0.75);
    let resize_cfg = req.resize;
    let detect_enabled = req.detect_enabled.unwrap_or(true);
    let detect_prefer_gpu = req.detect_prefer_gpu.unwrap_or(true);
    let detect_threshold = req.detect_threshold.unwrap_or(0.25);

    let available = discover_weights();
    let cpu_weight = resolve_weight(req.cpu_weight_path, CPU_WEIGHT_NAME, CPU_WEIGHT_REGEX, &available, "cpu");
    let gpu_weight = resolve_weight(req.gpu_weight_path, GPU_WEIGHT_NAME, GPU_WEIGHT_REGEX, &available, "gpu");
    let detect_weight = resolve_weight(req.detect_weight_path.clone(), "yolo_auto.ts", DETECTION_WEIGHT_REGEX, &available, "gpu")
        .or_else(|| resolve_weight(req.detect_weight_path, "yolo_auto.ts", DETECTION_WEIGHT_REGEX, &available, "cpu"));

    // Try to enable QNNPACK first, fall back to FBGEMM so quantized models can load.
    QEngine::QNNPACK
        .set()
        .or_else(|err_qnnpack| {
            QEngine::FBGEMM
                .set()
                .map_err(|err_fbgemm| format!("Failed to set QNNPACK ({err_qnnpack}) or FBGEMM ({err_fbgemm})"))
        })
        .map_err(|err| format!("Quantization backend unavailable: {err}"))?;

    let gpu_available = Cuda::is_available() && gpu_weight.is_some();
    let gpu_count = if gpu_available {
        Cuda::device_count()
    } else {
        0
    } as usize;

    let use_gpu = prefer_gpu && gpu_available;
    let target_device = if use_gpu { Device::Cuda(0) } else { Device::Cpu };
    let model_path = if use_gpu {
        gpu_weight.clone().ok_or_else(|| "GPU weight file not found".to_string())?
    } else {
        cpu_weight.clone().ok_or_else(|| "CPU weight file not found".to_string())?
    };

    let cached = get_or_load_model(&model_path, target_device)?;
    // Try to infer the model's expected grid/stride from the TorchScript weights; always
    // enforce a 608px floor to satisfy typical YOLO requirements.
    let inferred_min_side = infer_min_side_from_model(&cached).unwrap_or(MIN_INPUT_FALLBACK);
    let min_side = inferred_min_side.max(MIN_INPUT_FALLBACK);
    let detection_device = if detect_enabled && detect_weight.is_some() {
        if detect_prefer_gpu && Cuda::is_available() {
            Some(Device::Cuda(0))
        } else {
            Some(Device::Cpu)
        }
    } else {
        None
    };
    let processed: Vec<_> = req
        .images
        .into_par_iter()
        .map(|img| preprocess_image(img, target_device, resize_cfg, min_side))
        .collect();

    let mut results = Vec::new();
    let mut errors = Vec::new();

    let detection_cached = if let (Some(det_path), Some(det_dev)) = (detect_weight.clone(), detection_device) {
        match get_or_load_model(&det_path, det_dev) {
            Ok(m) => Some(m),
            Err(err) => {
                errors.push(InferenceFailure {
                    name: "__model__/yolo".to_string(),
                    message: format!("Detection model load failed ({:?}): {err}", det_path),
                });
                None
            }
        }
    } else {
        None
    };

    for item in processed {
        match item {
            Ok((name, tensor, det_base, (width, height, channels))) => {
                let (duration_ms, preview, mask) = if segmentation_enabled {
                    match forward_image(&cached, tensor, preview_len, mask_threshold) {
                        Ok(v) => v,
                        Err(err) => {
                            errors.push(InferenceFailure { name: name.clone(), message: err });
                            continue;
                        }
                    }
                } else {
                    (
                        0,
                        InferenceOutputPreview { values: Vec::new(), total_values: 0, shape: vec![] },
                        None,
                    )
                };

                let detection = if let (Some(det_cache), Some(det_dev)) = (detection_cached.as_ref(), detection_device) {
                    if segmentation_enabled {
                        if let Some(m) = mask.as_ref() {
                            match run_detection(det_cache, det_dev, &det_base, Some(m), detect_threshold, width, height) {
                                Ok(det) => Some(det),
                                Err(err) => {
                                    errors.push(InferenceFailure {
                                        name: name.clone(),
                                        message: format!("Detection failed: {err}"),
                                    });
                                    None
                                }
                            }
                        } else {
                            errors.push(InferenceFailure {
                                name: name.clone(),
                                message: "Segmentation enabled but mask missing; skipping YOLO".to_string(),
                            });
                            None
                        }
                    } else {
                        match run_detection(det_cache, det_dev, &det_base, None, detect_threshold, width, height) {
                            Ok(det) => Some(det),
                            Err(err) => {
                                errors.push(InferenceFailure {
                                    name: name.clone(),
                                    message: format!("Detection failed: {err}"),
                                });
                                None
                            }
                        }
                    }
                } else {
                    None
                };
                results.push(InferenceSampleResult {
                    name,
                    duration_ms,
                    width,
                    height,
                    channels,
                    device: format_device(target_device),
                    preview,
                    mask,
                    detection,
                });
            }
            Err((name, err)) => errors.push(InferenceFailure { name, message: err }),
        }
    }

    Ok(InferenceBatchResult {
        backend: BackendInfo {
            device: format_device(target_device),
            gpu: matches!(target_device, Device::Cuda(_)),
            gpu_count,
            model_path: path_to_string(&model_path),
            weights: WeightStatus {
                cpu_path: cpu_weight.as_deref().map(path_to_string),
                gpu_path: gpu_weight.as_deref().map(path_to_string),
                available,
            },
        },
        results,
        errors,
    })
}

fn forward_image(
    cached: &CachedModel,
    tensor: Tensor,
    preview_len: usize,
    mask_threshold: f32,
) -> Result<(u128, InferenceOutputPreview, Option<MaskData>), String> {
    let start = Instant::now();
    let output = {
        let guard = cached
            .model
            .lock()
            .map_err(|_| "Model mutex poisoned".to_string())?;
        guard
            .forward_ts(&[tensor])
            .map_err(|e| format!("Forward pass failed: {e}"))?
    };
    let duration_ms = start.elapsed().as_millis();

    let output_cpu = output
        .to_device(Device::Cpu)
        .to_kind(Kind::Float);
    let flat: Vec<f32> = output_cpu
        .flatten(0, -1)
        .try_into()
        .map_err(|e| format!("Failed to convert output tensor: {e}"))?;
    let preview = InferenceOutputPreview {
        values: flat.iter().copied().take(preview_len).collect(),
        total_values: flat.len(),
        shape: output_cpu.size(),
    };
    let mask = extract_mask(&output_cpu, mask_threshold);
    Ok((duration_ms, preview, mask))
}

fn extract_mask(output: &Tensor, threshold: f32) -> Option<MaskData> {
    let size = output.size();
    let (h, w, plane) = match size.len() {
        4 if size.len() >= 4 => (size[2], size[3], output.i((0, 0))),
        3 => (size[1], size[2], output.i(0)),
        2 => (size[0], size[1], output.shallow_clone()),
        _ => return None,
    };

    let probs = plane.sigmoid();
    let bin = probs.gt(threshold as f64);
    let data: Vec<u8> = bin
        .to_kind(Kind::Uint8)
        .f_mul_scalar(255i64)
        .ok()?
        .flatten(0, -1)
        .try_into()
        .ok()?;

    Some(MaskData {
        width: w,
        height: h,
        data,
    })
}

fn run_detection(
    cached: &CachedModel,
    device: Device,
    base_image: &Tensor,
    mask: Option<&MaskData>,
    threshold: f32,
    width: i64,
    height: i64,
) -> Result<DetectionResult, String> {
    // Use the original normalized image; apply mask as a gate over all channels.
    let target_w = round_up_to_stride(width.max(DETECTION_MIN_SIDE), DETECTION_STRIDE_FALLBACK);
    let target_h = round_up_to_stride(height.max(DETECTION_MIN_SIDE), DETECTION_STRIDE_FALLBACK);
    let pad_w = target_w - width;
    let pad_h = target_h - height;
    let pad_left = pad_w / 2;
    let pad_right = pad_w - pad_left;
    let pad_top = pad_h / 2;
    let pad_bottom = pad_h - pad_top;

    let padded_image = base_image
        .f_constant_pad_nd(&[pad_left, pad_right, pad_top, pad_bottom])
        .map_err(|e| format!("Detection padding failed: {e}"))?;

    // Build a binary mask (0/1) aligned to the padded image, then gate the image.
    let masked_input = if let Some(m) = mask {
        let mut mask_tensor = Tensor::f_from_slice(&m.data)
            .map_err(|e| format!("Failed to build mask tensor: {e}"))?
            .to_kind(Kind::Float)
            / 255.0;
        mask_tensor = mask_tensor.reshape([1, 1, m.height, m.width]);
        if m.height != target_h || m.width != target_w {
            mask_tensor = mask_tensor.upsample_nearest2d(&[target_h, target_w], None, None);
        }
        padded_image.to_device(device) * mask_tensor.to_device(device)
    } else {
        padded_image.to_device(device)
    };

    let input_shape = masked_input.size();

    let output = {
        let guard = cached
            .model
            .lock()
            .map_err(|_| "Detection model mutex poisoned".to_string())?;
        // Some YOLO exports return tuples/lists; try forward_ts first, fall back to forward_is.
        match guard.forward_ts(&[masked_input.shallow_clone()]) {
            Ok(t) => t,
            Err(e_ts) => {
                let iv = guard
                    .forward_is(&[IValue::Tensor(masked_input)])
                    .map_err(|e| format!("Detection forward failed: {e}; original: {e_ts}"))?;
                match iv {
                    IValue::Tensor(t) => t,
                    IValue::Tuple(items) | IValue::GenericList(items) => {
                        items
                            .into_iter()
                            .find_map(|v| match v {
                                IValue::Tensor(t) => Some(t),
                                _ => None,
                            })
                            .ok_or_else(|| "Detection forward did not return a tensor".to_string())?
                    }
                    other => {
                        return Err(format!(
                            "Detection forward did not return a tensor: {other:?}; original: {e_ts}"
                        ))
                    }
                }
            }
        }
    };

    let out_cpu = output.to_device(Device::Cpu).to_kind(Kind::Float);
    let size = out_cpu.size();
    // If the model already returns an N x M matrix, keep existing path; otherwise fall back to YOLO-style decoding.
    let boxes = if size.len() == 2 && size.get(1).cloned().unwrap_or(0) >= 6 {
        let flat: Vec<f32> = out_cpu
            .flatten(0, -1)
            .try_into()
            .map_err(|e| format!("Convert det output failed: {e}"))?;
        let stride = size[1] as usize;
        let mut boxes = Vec::new();
        for chunk in flat.chunks(stride) {
            if chunk.len() < 6 {
                continue;
            }
            let score = chunk[4];
            if score < threshold {
                continue;
            }
            boxes.push(DetectionBox {
                x1: chunk[0],
                y1: chunk[1],
                x2: chunk[2],
                y2: chunk[3],
                score,
                class_id: chunk[5].round() as i64,
            });
        }
        boxes
    } else {
        // YOLOv5/8 TorchScript often returns [B, anchors, grid, grid, channels] or [B, boxes, channels]
        let channels = *size.last().unwrap_or(&0);
        if channels >= 6 {
            let flat: Vec<f32> = out_cpu
                .flatten(0, -1)
                .try_into()
                .map_err(|e| format!("Convert det output failed: {e}"))?;
            let stride = channels as usize;
            let mut boxes = Vec::new();
            for chunk in flat.chunks(stride) {
                if chunk.len() < 6 {
                    continue;
                }
                // Assume xywh + obj + class scores
                let (x, y, w, h, obj) = (chunk[0], chunk[1], chunk[2], chunk[3], chunk[4]);
                let mut best_cls = 0i64;
                let mut best_conf = 0f32;
                for (idx, cls_score) in chunk.iter().enumerate().skip(5) {
                    let conf = obj * *cls_score;
                    if conf > best_conf {
                        best_conf = conf;
                        best_cls = (idx - 5) as i64;
                    }
                }
                if best_conf < threshold {
                    continue;
                }
                let x1 = x - w / 2.0;
                let y1 = y - h / 2.0;
                let x2 = x + w / 2.0;
                let y2 = y + h / 2.0;
                boxes.push(DetectionBox {
                    x1,
                    y1,
                    x2,
                    y2,
                    score: best_conf,
                    class_id: best_cls,
                });
            }
            boxes
        } else {
            Vec::new()
        }
    };

    let nmsed = non_max_suppression(boxes, DETECTION_IOU_THRESHOLD);

    Ok(DetectionResult {
        model_path: path_to_string(&cached.path),
        device: format_device(device),
        input_shape,
        pad: [pad_left, pad_right, pad_top, pad_bottom],
        boxes: nmsed,
    })
}

fn preprocess_image(
    img: InferenceImagePayload,
    device: Device,
    resize_cfg: Option<ResizeConfig>,
    min_side: i64,
) -> Result<(String, Tensor, Tensor, (i64, i64, i64)), (String, String)> {
    match image::load_from_memory(&img.data) {
        Ok(tensor) => {
            let dims = tensor.size();
            if dims.len() != 3 {
                return Err((img.name, format!("Unexpected image dims: {:?}", dims)));
            }
            let channels = dims[0];
            let height = dims[1];
            let width = dims[2];
            let normalized = tensor.to_kind(Kind::Float) / 255.0;
            let mut chw = normalized;
            if let Some(cfg) = resize_cfg {
                let target = [cfg.height, cfg.width];
                let up = chw
                    .unsqueeze(0)
                    .upsample_bilinear2d(&target, false, None, None);
                // back to CHW
                chw = up.squeeze_dim(0);
            }
            let final_size = chw.size();
            let mut fin_dims = if final_size.len() == 3 {
                (final_size[2], final_size[1], final_size[0])
            } else {
                (width, height, channels)
            };

            // If the image is smaller than the model's expected side length (or 608px), pad
            // symmetrically with zeros to avoid shape mismatches in downstream detection.
            if fin_dims.0 < min_side || fin_dims.1 < min_side {
                let target_w = fin_dims.0.max(min_side);
                let target_h = fin_dims.1.max(min_side);
                let pad_w = target_w - fin_dims.0;
                let pad_h = target_h - fin_dims.1;
                let pad_left = pad_w / 2;
                let pad_right = pad_w - pad_left;
                let pad_top = pad_h / 2;
                let pad_bottom = pad_h - pad_top;

                chw = chw
                    .f_constant_pad_nd(&[pad_left, pad_right, pad_top, pad_bottom])
                    .map_err(|e| (img.name.clone(), format!("Padding failed: {e}")))?;
                fin_dims = (target_w, target_h, fin_dims.2);
            }
            let input = chw.unsqueeze(0).to_device(device);
            let det_base = chw.unsqueeze(0); // keep on CPU; will move to detection device later
            Ok((img.name, input, det_base, fin_dims))
        }
        Err(err) => Err((img.name, format!("Failed to decode image: {err}"))),
    }
}

fn infer_min_side_from_model(model: &CachedModel) -> Option<i64> {
    let guard = model.model.lock().ok()?;
    let params = guard.named_parameters().ok()?;

    let mut stride_hint: Option<i64> = None;
    let mut grid_hint: Option<i64> = None;

    for (name, tensor) in params {
        let lower = name.to_lowercase();
        if lower.contains("stride") {
            let flat: Result<Vec<i64>, _> = tensor.to_device(Device::Cpu).flatten(0, -1).try_into();
            if let Ok(vals) = flat {
                if let Some(max_stride) = vals.into_iter().filter(|v| *v > 0 && *v < 4096).max() {
                    stride_hint = Some(stride_hint.map_or(max_stride, |cur| cur.max(max_stride)));
                }
            }
        }

        if lower.contains("grid") || lower.contains("anchor") {
            let size = tensor.size();
            if let Some(max_dim) = size.into_iter().filter(|d| *d > 1).max() {
                grid_hint = Some(grid_hint.map_or(max_dim, |cur| cur.max(max_dim)));
            }
        }
    }

    match (grid_hint, stride_hint) {
        (Some(grid), Some(stride)) if grid > 0 && stride > 0 => Some(grid * stride),
        _ => None,
    }
}

fn get_or_load_model(path: &Path, device: Device) -> Result<CachedModel, String> {
    let mut cache = MODEL_CACHE
        .lock()
        .map_err(|_| "Model cache mutex poisoned".to_string())?;
    let slot = match device {
        Device::Cuda(_) => &mut cache.gpu,
        _ => &mut cache.cpu,
    };

    if let Some(existing) = slot {
        if existing.path == path {
            return Ok(existing.clone());
        }
    }

    let mut module =
        CModule::load_on_device(path, device).map_err(|e| format!("Load model failed: {e}"))?;
    module.to(device, Kind::Float, false);

    let cached = CachedModel {
        path: path.to_path_buf(),
        model: Arc::new(Mutex::new(module)),
    };
    *slot = Some(cached.clone());
    Ok(cached)
}

fn round_up_to_stride(val: i64, stride: i64) -> i64 {
    if stride <= 1 {
        return val;
    }
    ((val + stride - 1) / stride) * stride
}

fn iou(a: &DetectionBox, b: &DetectionBox) -> f32 {
    let x1 = a.x1.max(b.x1);
    let y1 = a.y1.max(b.y1);
    let x2 = a.x2.min(b.x2);
    let y2 = a.y2.min(b.y2);
    let inter_w = (x2 - x1).max(0.0);
    let inter_h = (y2 - y1).max(0.0);
    let inter = inter_w * inter_h;
    if inter <= 0.0 {
        return 0.0;
    }
    let area_a = (a.x2 - a.x1).max(0.0) * (a.y2 - a.y1).max(0.0);
    let area_b = (b.x2 - b.x1).max(0.0) * (b.y2 - b.y1).max(0.0);
    inter / (area_a + area_b - inter + f32::EPSILON)
}

fn non_max_suppression(mut boxes: Vec<DetectionBox>, iou_thresh: f32) -> Vec<DetectionBox> {
    boxes.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let mut picked = Vec::new();
    while let Some(b) = boxes.pop() {
        let keep = picked.iter().all(|p| iou(&b, p) < iou_thresh);
        if keep {
            picked.push(b);
        }
    }
    picked
}

fn locate_weight(file_name: &str) -> Option<PathBuf> {
    let dirs = candidate_dirs();

    let mut seen = HashSet::new();
    for dir in dirs {
        let candidate = dir.join(file_name);
        if candidate.exists() {
            let key = candidate.to_string_lossy().to_string();
            if seen.insert(key) {
                return Some(candidate);
            }
        }
    }
    None
}

fn locate_weight_by_regex(pattern: &str) -> Option<PathBuf> {
    let re = regex::Regex::new(pattern).ok()?;
    let dirs = candidate_dirs();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if re.is_match(name) {
                return Some(path);
            }
        }
    }
    None
}

fn resolve_weight(
    custom: Option<String>,
    default_name: &str,
    regex: &str,
    available: &[WeightInfo],
    target_device: &str,
) -> Option<PathBuf> {
    if let Some(p) = custom {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }
    // First, see if any discovered weight matches device hint
    for info in available {
        let dev = info.device.to_lowercase();
        if (target_device == "cpu" && dev.contains("cpu"))
            || (target_device == "gpu" && (dev.contains("gpu") || dev.contains("inference")))
        {
            let pb = PathBuf::from(&info.path);
            if pb.exists() {
                return Some(pb);
            }
        }
    }
    // Prefer explicit filename first, then regex match
    locate_weight(default_name).or_else(|| locate_weight_by_regex(regex))
}

fn candidate_dirs() -> Vec<PathBuf> {
    fn with_subdirs(base: PathBuf) -> Vec<PathBuf> {
        vec![
            base.clone(),
            base.join("segmentation"),
            base.join("detection"),
        ]
    }

    let mut dirs = Vec::new();

    if let Ok(cwd) = std::env::current_dir() {
        dirs.extend(with_subdirs(cwd.join("assets/models")));
        dirs.extend(with_subdirs(cwd.join("public/models")));
        dirs.extend(with_subdirs(cwd.join("dist/models")));
        dirs.extend(with_subdirs(cwd.join("resources")));
        dirs.extend(with_subdirs(cwd.join("resources/models")));
        dirs.extend(with_subdirs(cwd.join("3rdparty/pytorch/build/lib")));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.extend(with_subdirs(dir.to_path_buf()));
            dirs.extend(with_subdirs(dir.join("models")));
            dirs.extend(with_subdirs(dir.join("resources")));
            dirs.extend(with_subdirs(dir.join("resources/models")));
            if let Some(parent) = dir.parent() {
                dirs.extend(with_subdirs(parent.join("Resources")));
                dirs.extend(with_subdirs(parent.join("resources")));
                dirs.extend(with_subdirs(parent.join("resources/models")));
            }
        }
    }

    dirs
}

fn discover_weights() -> Vec<WeightInfo> {
    // Pattern: <model>_<device>_<format>.(ts|pt|torchscript)
    let re = match regex::Regex::new(r"(?i)^(?P<model>.+?)_(?P<device>cpu|gpu|inference)_(?P<format>fp32|fp16|int8)\.(?P<ext>ts|pt|torchscript)$") {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    let dirs = candidate_dirs();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir.clone()) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if let Some(caps) = re.captures(name) {
                let model = caps.name("model").map(|m| m.as_str().to_string()).unwrap_or_default();
                let device = caps.name("device").map(|m| m.as_str().to_string()).unwrap_or_default();
                let format = caps.name("format").map(|m| m.as_str().to_string()).unwrap_or_default();
                let ext = caps.name("ext").map(|m| m.as_str().to_string()).unwrap_or_default();
                out.push(WeightInfo {
                    model,
                    device,
                    format,
                    extension: ext,
                    path: path.to_string_lossy().to_string(),
                });
            }
        }
    }
    out
}

fn format_device(device: Device) -> String {
    match device {
        Device::Cpu => "cpu".to_string(),
        Device::Cuda(idx) => format!("cuda:{idx}"),
        Device::Mps => "mps".to_string(),
        other => format!("{other:?}"),
    }
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}
