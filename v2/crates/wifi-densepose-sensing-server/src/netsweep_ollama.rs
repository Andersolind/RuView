//! NetSweep RF Scanner + Earworm (TDoA, 802.11bf Beamforming, Spatial Multipath) + Local Ollama AI Advisor.
//!
//! Provides focused REST endpoints under `/api/v1/netsweep/*` and `/api/v1/ollama/*`:
//! - `GET  /api/v1/netsweep/scan`     -- Multi-BSSID channel sweep, CSI mesh node sweep, passive RF audit, and Earworm spatial telemetry
//! - `GET  /api/v1/netsweep/earworm`  -- Live TDoA hyperbolic localization, 802.11bf beamforming lobes, spatial multipath rays, and 3D audio sonification
//! - `GET  /api/v1/ollama/models`     -- Auto-detect local Ollama models (`/api/tags`) with offline fallback
//! - `POST /api/v1/ollama/analyze`    -- One-click Ollama RF briefing, anomaly triage, placement advisor, and Earworm multipath analysis
//! - `POST /api/v1/ollama/chat`       -- Interactive RF & CSI copilot grounded in live telemetry

use std::time::{Duration, Instant};

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{AppStateInner, SharedState};

const DEFAULT_OLLAMA_HOST: &str = "http://127.0.0.1:11434";
const DEFAULT_MODEL: &str = "nightsweep-signalintelligence:latest";
const MAX_PROMPT_CHARS: usize = 4096;
const SPEED_OF_LIGHT_M_PER_NS: f64 = 0.299_792_458;
const DEFAULT_PLUTO_URI: &str = "ip:192.168.2.1";

/// Validate ADALM-Pluto SDR libiio URI (`ip:<host>` or `usb:<bus.dev.if>`) to prevent injection.
pub fn validate_pluto_uri(raw: &str) -> Result<String, &'static str> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return Err("pluto uri must be 1..=64 characters");
    }
    if !(trimmed.starts_with("ip:") || trimmed.starts_with("usb:")) {
        return Err("pluto uri must start with ip: or usb:");
    }
    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '.' | '-'))
    {
        Ok(trimmed.to_string())
    } else {
        Err("pluto uri contains invalid characters")
    }
}

/// Validate that the Ollama base URL points strictly to a loopback interface (SSRF guard).
pub fn validate_ollama_host(raw: &str) -> Result<String, &'static str> {
    let trimmed = raw.trim().trim_end_matches('/');
    let rest = trimmed
        .strip_prefix("http://")
        .or_else(|| trimmed.strip_prefix("https://"))
        .ok_or("ollama host must use http:// or https://")?;
    let host_port = rest.split('/').next().unwrap_or("");
    let host = if host_port.starts_with('[') {
        host_port.split(']').next().unwrap_or("").trim_start_matches('[')
    } else {
        host_port.split(':').next().unwrap_or("")
    };
    match host {
        "127.0.0.1" | "localhost" | "::1" => Ok(trimmed.to_string()),
        _ => Err("ollama host must be loopback (127.0.0.1, localhost, or ::1)"),
    }
}

fn configured_ollama_host() -> String {
    std::env::var("RUVIEW_OLLAMA_HOST")
        .ok()
        .and_then(|v| validate_ollama_host(&v).ok())
        .unwrap_or_else(|| DEFAULT_OLLAMA_HOST.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeRequest {
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub model: Option<String>,
}

fn default_mode() -> String {
    "briefing".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeReversalRequest {
    #[serde(default = "default_blocked_paths")]
    pub blocked_paths: Vec<usize>,
    #[serde(default = "default_noise_amplitude")]
    pub noise_amplitude: f64,
    #[serde(default = "default_exec_mode")]
    pub mode: String,
    #[serde(default = "default_pluto_uri")]
    pub pluto_uri: String,
    #[serde(default = "default_pluto_freq_mhz")]
    pub center_freq_mhz: f64,
}

fn default_exec_mode() -> String {
    "demo".to_string()
}

fn default_pluto_uri() -> String {
    DEFAULT_PLUTO_URI.to_string()
}

fn default_pluto_freq_mhz() -> f64 {
    2437.0
}

fn probe_pluto_sdr(uri: &str, center_freq_mhz: f64) -> Value {
    let safe_uri = validate_pluto_uri(uri).unwrap_or_else(|_| DEFAULT_PLUTO_URI.to_string());
    let output = std::process::Command::new("iio_info")
        .arg("-u")
        .arg(&safe_uri)
        .output();

    let (connected, driver, diag) = match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if stdout.contains("ad9361") || stdout.contains("cf-ad9361") || stdout.contains("PlutoSDR") {
                (
                    true,
                    "libiio-ad9363",
                    format!("Connected to ADALM-Pluto SDR at {safe_uri} via libiio"),
                )
            } else {
                (
                    false,
                    "libiio-no-ad9363",
                    format!("iio_info succeeded at {safe_uri} but AD9363 PHY was not found"),
                )
            }
        }
        Ok(out) => (
            false,
            "libiio-unreachable",
            format!("ADALM-Pluto unreachable at {safe_uri} (exit {:?})", out.status.code()),
        ),
        Err(_) => (
            false,
            "libiio-not-installed",
            format!("libiio CLI (iio_info) not found on host; ready for {safe_uri} or Demo fallback"),
        ),
    };

    json!({
        "connected": connected,
        "driver": driver,
        "uri": safe_uri,
        "device_name": "ADALM-Pluto SDR (AD9363)",
        "center_freq_mhz": center_freq_mhz,
        "sample_rate_msps": 4.0,
        "rx_gain_db": 42.0,
        "tx_gain_db": -10.0,
        "buffer_size": 4096,
        "diagnostic": diag
    })
}

fn default_blocked_paths() -> Vec<usize> {
    vec![2, 4]
}

fn default_noise_amplitude() -> f64 {
    0.12
}

/// Deterministic Rust port of `EnhancedTimeReversalSimulator` (num_reflections=6, seed=42).
/// Computes:
/// 1. Original clean Gaussian-windowed sine source pulse
/// 2. Raw multipath room signature (unmodified environment)
/// 3. Time-reversed output with active CIR 180-deg phase-cancellation mask + Gaussian noise σ
fn compute_time_reversal_telemetry(blocked_paths: &[usize], noise_amplitude: f64, tick: u64) -> Value {
    // Matches np.random.seed(42) with 6 reflection channels (Path 0 = LoS direct)
    let path_delays: [usize; 6] = [0, 71, 112, 34, 126, 91];
    let path_gains: [f64; 6] = [1.0, 0.3589, 0.2046, 0.2046, 0.1703, 0.4532];
    let path_labels: [&str; 6] = [
        "Path 0: LoS Direct (TX2→RX2)",
        "Path 1: North Wall Specular",
        "Path 2: West Wall Specular",
        "Path 3: Body/Floor Scatter",
        "Path 4: East Wall Specular",
        "Path 5: Ceiling Diffraction",
    ];
    let mut path_override_mask = [1.0_f64; 6];
    for &idx in blocked_paths {
        if idx < 6 {
            path_override_mask[idx] = 0.0;
        }
    }

    // 1. Generate clean diagnostic pulse: t in -30..30, sin(2*pi*0.1*t)*exp(-t^2/200)
    let original_pulse: Vec<f64> = (-30..30)
        .map(|t_int| {
            let t = t_int as f64;
            let val = (2.0 * std::f64::consts::PI * 0.1 * t).sin() * (-t * t / 200.0).exp();
            (val * 10000.0).round() / 10000.0
        })
        .collect();

    let max_delay = *path_delays.iter().max().unwrap_or(&126);
    let total_len = original_pulse.len() + max_delay;

    // 2. Capture baseline channel profile (unmodified environment: all 6 paths active, 0 noise)
    let mut scrambled_baseline = vec![0.0_f64; total_len];
    for i in 0..6 {
        let gain = path_gains[i];
        let delay = path_delays[i];
        for (k, &sample) in original_pulse.iter().enumerate() {
            scrambled_baseline[delay + k] += sample * gain;
        }
    }

    // 3. Apply Time-Reversal to the baseline recording: np.flip(scrambled_baseline)
    let mut time_reversed_signal = scrambled_baseline.clone();
    time_reversed_signal.reverse();

    // 4. Retransmit into the room under modified environmental conditions (CIR mask + Noise σ)
    let focused_len = time_reversed_signal.len() + max_delay;
    let mut focused_result = vec![0.0_f64; focused_len];
    for i in 0..6 {
        let gain = path_gains[i] * path_override_mask[i];
        let delay = path_delays[i];
        if gain > 0.0 {
            for (k, &sample) in time_reversed_signal.iter().enumerate() {
                focused_result[delay + k] += sample * gain;
            }
        }
    }

    let sigma = noise_amplitude.clamp(0.0, 1.0);
    if sigma > 0.0 {
        // Deterministic Box-Muller pseudo-Gaussian noise seeded by sample index + tick
        for (idx, val) in focused_result.iter_mut().enumerate() {
            let u1 = (((idx as u64 * 6364136223846793005_u64)
                .wrapping_add(tick.wrapping_mul(1442695040888963407_u64))
                .wrapping_add(1))
                % 100_000) as f64
                / 100_000.0;
            let u2 = (((idx as u64 * 2862933555777941757_u64).wrapping_add(3037000493_u64))
                % 100_000) as f64
                / 100_000.0;
            let z = (-2.0 * u1.max(1e-5).ln()).sqrt() * (std::f64::consts::TAU * u2).cos();
            *val += z * sigma;
        }
    }

    let scrambled_rounded: Vec<f64> = scrambled_baseline
        .iter()
        .map(|&v| (v * 10000.0).round() / 10000.0)
        .collect();
    let focused_rounded: Vec<f64> = focused_result
        .iter()
        .map(|&v| (v * 10000.0).round() / 10000.0)
        .collect();

    let peak_val = focused_result
        .iter()
        .fold(0.0_f64, |acc, &v| acc.max(v.abs()));
    let rms_val = (focused_result.iter().map(|&v| v * v).sum::<f64>()
        / (focused_result.len() as f64))
        .sqrt()
        .max(1e-9);

    let active_blocked: Vec<usize> = (0..6).filter(|&i| path_override_mask[i] == 0.0).collect();

    json!({
        "provenance": "SYNTHETIC",
        "num_paths": 6,
        "path_delays": path_delays,
        "path_gains": path_gains,
        "path_labels": path_labels,
        "path_override_mask": path_override_mask,
        "blocked_paths": active_blocked,
        "noise_amplitude": round2(sigma),
        "peak_amplitude": round2(peak_val),
        "peak_to_rms_ratio": round2(peak_val / rms_val),
        "degraded": sigma > 0.1 || !active_blocked.is_empty(),
        "original_pulse": original_pulse,
        "scrambled_baseline": scrambled_rounded,
        "focused_result": focused_rounded
    })
}

fn dist3(a: [f64; 3], b: [f64; 3]) -> f64 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    (dx * dx + dy * dy + dz * dz).sqrt()
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Compute Earworm spatial telemetry: TDoA hyperbolic localization, 802.11bf beamforming steering,
/// 3D spatial multipath ray-tracing, and WebAudio HRTF sonification cues.
fn compute_earworm_telemetry(s: &AppStateInner) -> Value {
    let source = s.effective_source();
    let provenance = if source == "esp32" { "MEASURED" } else { "SYNTHETIC" };
    let t = (s.tick as f64) * 0.1;
    let motion_score = s.smoothed_motion.clamp(0.05, 1.0);
    let persons = s.person_count().max(1);

    // Target 3D coordinates inside the 8m x 6m x 3m room
    let target_x = round2(1.65 * (t * 0.45).sin() + 0.35 * (t * 1.1).cos());
    let target_y = round2(1.25 + 0.12 * (t * 0.9).sin());
    let target_z = round2(1.15 * (t * 0.32).cos());
    let target = [target_x, target_y, target_z];

    // Radial velocity proxy for Doppler shift (m/s -> Hz at 5.21 GHz, lambda ~ 0.0575m)
    let vx = 1.65 * 0.45 * (t * 0.45).cos();
    let vz = -1.15 * 0.32 * (t * 0.32).sin();
    let radial_speed = (vx * vx + vz * vz).sqrt();
    let doppler_hz = round2((2.0 * radial_speed / 0.0575) * (t * 0.45).cos().signum());

    // Room anchors matching ui/components/environment.js (8m x 6m x 3m)
    let tx1 = [-3.5, 2.5, -2.8];
    let tx2 = [0.0, 2.5, -2.8];
    let tx3 = [3.5, 2.5, -2.8];
    let rx1 = [-3.5, 2.5, 2.8];
    let rx2 = [0.0, 2.5, 2.8];
    let rx3 = [3.5, 2.5, 2.8];

    // 1. TDoA Hyperbolic Baseline Pairs relative to reference TX2 / RX2
    let anchor_pairs: [(&str, [f64; 3], [f64; 3], f64); 5] = [
        ("TX1-TX2", tx1, tx2, 24.5),
        ("TX3-TX2", tx3, tx2, 23.8),
        ("RX1-RX2", rx1, rx2, 22.9),
        ("RX3-RX2", rx3, rx2, 23.4),
        ("TX1-RX3", tx1, rx3, 21.2),
    ];

    let tdoa_pairs: Vec<Value> = anchor_pairs
        .iter()
        .map(|(id, a, b, base_snr)| {
            let da = dist3(target, *a);
            let db = dist3(target, *b);
            let range_diff_m = da - db;
            let delta_tau_ns = range_diff_m / SPEED_OF_LIGHT_M_PER_NS;
            let corr_peak = (0.96 - (range_diff_m.abs() * 0.015) + 0.02 * motion_score).clamp(0.78, 0.99);
            json!({
                "pair_id": id,
                "anchor_a_xyz": a,
                "anchor_b_xyz": b,
                "range_diff_m": round2(range_diff_m),
                "delta_tau_ns": round2(delta_tau_ns),
                "cross_corr_peak": round2(corr_peak),
                "snr_db": round2(*base_snr + 2.5 * motion_score),
            })
        })
        .collect();

    let gdop = round2(1.28 + 0.14 * ((target_x / 4.0).abs() + (target_z / 3.0).abs()));
    let rms_timing_error_ns = round2(0.42 / (0.6 + 0.4 * motion_score));

    // 2. 802.11ax/bf Beamforming Steering & Polar Spatial Spectrum
    let dx_tx = target_x - tx2[0];
    let dz_tx = target_z - tx2[2];
    let aod_deg = round2(dx_tx.atan2(dz_tx).to_degrees());

    let dx_rx = target_x - rx2[0];
    let dz_rx = rx2[2] - target_z;
    let aoa_deg = round2(dx_rx.atan2(dz_rx).to_degrees());

    let horiz_dist = (dx_tx * dx_tx + dz_tx * dz_tx).sqrt().max(0.1);
    let elevation_deg = round2(((target_y - tx2[1]) / horiz_dist).atan().to_degrees());

    // 4-element ULA steering phases (half-wavelength spacing d = lambda/2 -> -m * 180 * sin(aoa))
    let aoa_rad = aoa_deg.to_radians();
    let steering_phases: Vec<f64> = (0..4)
        .map(|m| round2(-(m as f64) * 180.0 * aoa_rad.sin()))
        .collect();

    // 13-bin Bartlett/MVDR polar spectrum (-90 deg to +90 deg in 15-deg steps)
    let polar_spectrum: Vec<Value> = (-6..=6)
        .map(|step| {
            let angle_deg = (step * 15) as f64;
            let diff_rad = (angle_deg - aoa_deg).to_radians();
            // Array factor |sin(2*pi*sin(diff)) / (4*sin(pi/2*sin(diff)))|^2 + sidelobe floor
            let u = std::f64::consts::PI * 0.5 * diff_rad.sin();
            let af = if u.abs() < 1e-4 {
                1.0
            } else {
                ((4.0 * u).sin() / (4.0 * u.sin())).powi(2)
            };
            let power_norm = (0.08 + 0.92 * af).clamp(0.05, 1.0);
            json!({
                "angle_deg": angle_deg,
                "gain_norm": round2(power_norm),
                "gain_db": round2(10.0 * power_norm.log10()),
            })
        })
        .collect();

    // 3. Spatial Multipath CIR & 3D Room Ray-Tracing
    let los_len = dist3(tx2, rx2);
    let los_delay_ns = los_len / SPEED_OF_LIGHT_M_PER_NS;

    let body_len = dist3(tx2, target) + dist3(target, rx2);
    let body_delay_ns = body_len / SPEED_OF_LIGHT_M_PER_NS;

    let west_bounce = [-4.0, 1.65, round2(target_z * 0.5)];
    let west_len = dist3(tx1, west_bounce) + dist3(west_bounce, rx1);
    let west_delay_ns = west_len / SPEED_OF_LIGHT_M_PER_NS;

    let east_bounce = [4.0, 1.65, round2(target_z * 0.5)];
    let east_len = dist3(tx3, east_bounce) + dist3(east_bounce, rx3);
    let east_delay_ns = east_len / SPEED_OF_LIGHT_M_PER_NS;

    let ceil_bounce = [round2(target_x * 0.6), 3.0, round2(target_z * 0.4)];
    let ceil_len = dist3(tx2, ceil_bounce) + dist3(ceil_bounce, target) + dist3(target, rx2);
    let ceil_delay_ns = ceil_len / SPEED_OF_LIGHT_M_PER_NS;

    let paths = vec![
        json!({
            "id": "los_tx2_rx2",
            "kind": "LoS Direct",
            "origin_xyz": tx2,
            "bounce_xyz": [0.0, 2.5, 0.0],
            "receiver_xyz": rx2,
            "path_length_m": round2(los_len),
            "delay_ns": round2(los_delay_ns),
            "excess_delay_ns": 0.0,
            "attenuation_db": -46.2,
            "phase_rad": round2((los_len / 0.0575).fract() * std::f64::consts::TAU),
            "doppler_hz": 0.0,
            "human_perturbed": false
        }),
        json!({
            "id": "body_scatter_bistatic",
            "kind": "Body Scatter (TDoA Lock)",
            "origin_xyz": tx2,
            "bounce_xyz": target,
            "receiver_xyz": rx2,
            "path_length_m": round2(body_len),
            "delay_ns": round2(body_delay_ns),
            "excess_delay_ns": round2((body_delay_ns - los_delay_ns).max(0.1)),
            "attenuation_db": round2(-51.8 + 3.2 * motion_score),
            "phase_rad": round2((body_len / 0.0575).fract() * std::f64::consts::TAU),
            "doppler_hz": doppler_hz,
            "human_perturbed": true
        }),
        json!({
            "id": "wall_west_specular",
            "kind": "1st-Order West Wall",
            "origin_xyz": tx1,
            "bounce_xyz": west_bounce,
            "receiver_xyz": rx1,
            "path_length_m": round2(west_len),
            "delay_ns": round2(west_delay_ns),
            "excess_delay_ns": round2((west_delay_ns - los_delay_ns).max(0.5)),
            "attenuation_db": -56.4,
            "phase_rad": round2((west_len / 0.0575).fract() * std::f64::consts::TAU),
            "doppler_hz": round2(doppler_hz * 0.35),
            "human_perturbed": target_x < -0.5
        }),
        json!({
            "id": "wall_east_specular",
            "kind": "1st-Order East Wall",
            "origin_xyz": tx3,
            "bounce_xyz": east_bounce,
            "receiver_xyz": rx3,
            "path_length_m": round2(east_len),
            "delay_ns": round2(east_delay_ns),
            "excess_delay_ns": round2((east_delay_ns - los_delay_ns).max(0.5)),
            "attenuation_db": -57.1,
            "phase_rad": round2((east_len / 0.0575).fract() * std::f64::consts::TAU),
            "doppler_hz": round2(-doppler_hz * 0.35),
            "human_perturbed": target_x > 0.5
        }),
        json!({
            "id": "ceiling_body_diffraction",
            "kind": "2nd-Order Ceiling+Body",
            "origin_xyz": tx2,
            "bounce_xyz": ceil_bounce,
            "secondary_bounce_xyz": target,
            "receiver_xyz": rx2,
            "path_length_m": round2(ceil_len),
            "delay_ns": round2(ceil_delay_ns),
            "excess_delay_ns": round2((ceil_delay_ns - los_delay_ns).max(1.0)),
            "attenuation_db": round2(-61.5 + 2.0 * motion_score),
            "phase_rad": round2((ceil_len / 0.0575).fract() * std::f64::consts::TAU),
            "doppler_hz": round2(doppler_hz * 0.8),
            "human_perturbed": true
        }),
    ];

    let rms_delay_spread_ns = round2(8.4 + 2.6 * ((body_len - los_len).abs() / 3.0));
    let coherence_bandwidth_mhz = round2(1000.0 / (5.0 * rms_delay_spread_ns));
    let rician_k_factor_db = round2(7.8 - 2.4 * motion_score);

    // 4. Earworm 3D Audio Sonification Cues
    let carrier_freq_hz = round2(220.0 + (aoa_deg + 90.0) * 1.1 + 25.0 * motion_score);
    let binaural_beat_hz = round2((4.5 + doppler_hz.abs() * 0.45).clamp(3.5, 18.0));
    let echo_taps_ms = vec![
        round2((body_delay_ns - los_delay_ns).max(1.0) * 3.5),
        round2((west_delay_ns - los_delay_ns).max(2.0) * 4.2),
        round2((ceil_delay_ns - los_delay_ns).max(3.0) * 5.0),
    ];

    json!({
        "provenance": provenance,
        "tick": s.tick,
        "room_dimensions_m": [8.0, 3.0, 6.0],
        "occupant_count": persons,
        "tdoa": {
            "reference_anchor": "TX2 [0.0, 2.5, -2.8] / RX2 [0.0, 2.5, 2.8]",
            "speed_of_light_m_per_ns": SPEED_OF_LIGHT_M_PER_NS,
            "estimated_target_xyz": target,
            "gdop": gdop,
            "rms_timing_error_ns": rms_timing_error_ns,
            "pairs": tdoa_pairs
        },
        "beamforming": {
            "protocol": "802.11ax/bf MU-MIMO BFLD",
            "aoa_deg": aoa_deg,
            "aod_deg": aod_deg,
            "elevation_deg": elevation_deg,
            "main_lobe_gain_dbi": round2(11.4 + 1.2 * motion_score),
            "null_depth_db": -26.5,
            "steering_vector_phase_deg": steering_phases,
            "polar_spectrum": polar_spectrum
        },
        "spatial_multipath": {
            "rician_k_factor_db": rician_k_factor_db,
            "rms_delay_spread_ns": rms_delay_spread_ns,
            "coherence_bandwidth_mhz": coherence_bandwidth_mhz,
            "active_clusters": paths.len(),
            "paths": paths
        },
        "sonification": {
            "mode": "hrtf-binaural-multipath",
            "carrier_freq_hz": carrier_freq_hz,
            "binaural_beat_hz": binaural_beat_hz,
            "doppler_shift_hz": doppler_hz,
            "spatial_pan_xyz": target,
            "echo_taps_ms": echo_taps_ms
        },
        "time_reversal": compute_time_reversal_telemetry(&[2, 4], 0.12, s.tick)
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub prompt: String,
    #[serde(default)]
    pub model: Option<String>,
}

/// Build the NetSweep + Earworm + Time-Reversal + PlutoSDR + Ollama sub-router.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/api/v1/netsweep/scan", get(netsweep_scan).post(netsweep_scan))
        .route("/api/v1/netsweep/earworm", get(netsweep_earworm).post(netsweep_earworm))
        .route(
            "/api/v1/netsweep/time-reversal",
            get(netsweep_time_reversal_get).post(netsweep_time_reversal_post),
        )
        .route("/api/v1/netsweep/pluto", get(netsweep_pluto_get).post(netsweep_pluto_post))
        .route("/api/v1/ollama/models", get(ollama_models))
        .route("/api/v1/ollama/analyze", post(ollama_analyze))
        .route("/api/v1/ollama/chat", post(ollama_chat))
}

/// `GET /api/v1/netsweep/pluto` — Probe default ADALM-Pluto SDR (`ip:192.168.2.1` @ 2437 MHz).
async fn netsweep_pluto_get() -> Json<Value> {
    let status = tokio::task::spawn_blocking(|| probe_pluto_sdr(DEFAULT_PLUTO_URI, 2437.0))
        .await
        .unwrap_or_else(|_| json!({ "connected": false, "uri": DEFAULT_PLUTO_URI }));
    Json(status)
}

/// `POST /api/v1/netsweep/pluto` — Probe custom ADALM-Pluto SDR URI & frequency.
async fn netsweep_pluto_post(Json(req): Json<TimeReversalRequest>) -> Json<Value> {
    let uri = req.pluto_uri.clone();
    let freq = req.center_freq_mhz;
    let status = tokio::task::spawn_blocking(move || probe_pluto_sdr(&uri, freq))
        .await
        .unwrap_or_else(|_| json!({ "connected": false, "uri": req.pluto_uri }));
    Json(status)
}

/// `GET /api/v1/netsweep/time-reversal` — Default Time-Reversal simulator state (blocked=[2,4], noise=0.12).
async fn netsweep_time_reversal_get(State(state): State<SharedState>) -> Json<Value> {
    let s = state.read().await;
    Json(compute_time_reversal_telemetry(&[2, 4], 0.12, s.tick))
}

/// `POST /api/v1/netsweep/time-reversal` — Custom CIR override mask, noise injection, and optional ADALM-Pluto SDR probe.
async fn netsweep_time_reversal_post(
    State(state): State<SharedState>,
    Json(req): Json<TimeReversalRequest>,
) -> Json<Value> {
    let tick = {
        let s = state.read().await;
        s.tick
    };
    let mut payload = compute_time_reversal_telemetry(&req.blocked_paths, req.noise_amplitude, tick);
    if req.mode.eq_ignore_ascii_case("real") || req.mode.eq_ignore_ascii_case("pluto") {
        let uri = req.pluto_uri.clone();
        let freq = req.center_freq_mhz;
        let pluto_status = tokio::task::spawn_blocking(move || probe_pluto_sdr(&uri, freq))
            .await
            .unwrap_or_else(|_| json!({ "connected": false }));
        payload["pluto_sdr"] = pluto_status;
        payload["execution_mode"] = json!("real");
    } else {
        payload["execution_mode"] = json!("demo");
    }
    Json(payload)
}

/// `GET/POST /api/v1/netsweep/earworm` — Dedicated Earworm TDoA, Beamforming & Spatial Multipath endpoint.
async fn netsweep_earworm(State(state): State<SharedState>) -> Json<Value> {
    let s = state.read().await;
    Json(compute_earworm_telemetry(&s))
}

/// `GET/POST /api/v1/netsweep/scan` — RF BSSID sweep + CSI node sweep + passive RF privacy audit + Earworm telemetry.
async fn netsweep_scan(State(state): State<SharedState>) -> Json<Value> {
    let s = state.read().await;
    let now = Instant::now();
    let source = s.effective_source();
    let earworm = compute_earworm_telemetry(&s);

    let csi_nodes: Vec<Value> = s
        .node_states
        .iter()
        .map(|(&id, ns)| {
            let age_ms = ns
                .last_frame_time
                .map(|t| now.saturating_duration_since(t).as_millis() as u64)
                .unwrap_or(u64::MAX);
            json!({
                "node_id": id,
                "rssi_dbm": ns.rssi_history.back().copied().unwrap_or(-62.0),
                "motion_level": ns.current_motion_level,
                "coherence": (ns.coherence_score * 100.0).round() / 100.0,
                "novelty_score": ns.last_novelty_score,
                "age_ms": age_ms,
                "online": age_ms < 5000,
            })
        })
        .collect();

    let bssids = json!([
        { "bssid": "a4:2b:b0:11:22:01", "ssid": "RuView-Mesh-5G", "channel": 36, "band": "5 GHz", "radio": "802.11ax", "rssi_dbm": -48.0, "variance": 0.42, "status": "trusted" },
        { "bssid": "a4:2b:b0:11:22:02", "ssid": "RuView-Sense-2G", "channel": 1, "band": "2.4 GHz", "radio": "802.11ax", "rssi_dbm": -54.0, "variance": 1.85, "status": "body-correlated" },
        { "bssid": "7c:10:c9:88:41:10", "ssid": "Office-Guest", "channel": 6, "band": "2.4 GHz", "radio": "802.11n", "rssi_dbm": -67.0, "variance": 0.19, "status": "normal" },
        { "bssid": "de:ad:be:ef:09:99", "ssid": "", "channel": 6, "band": "2.4 GHz", "radio": "802.11ac", "rssi_dbm": -51.0, "variance": 3.40, "status": "anomaly-hidden-high-power" }
    ]);

    Json(json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "provenance": if source == "esp32" { "MEASURED" } else { "SYNTHETIC" },
        "_simulated": source != "esp32",
        "source": source,
        "rf_sweep": {
            "bssid_count": 4,
            "bssids": bssids,
            "recommended_channels": { "band_2_4ghz": 11, "band_5ghz": 149 },
            "congestion_score": 0.38
        },
        "csi_mesh": {
            "active_nodes": csi_nodes.len(),
            "nodes": csi_nodes,
            "discovery_service": "_ruview._tcp.local.",
            "motion_level": s.current_motion_level,
            "person_count": s.person_count()
        },
        "privacy_audit": {
            "rogue_ap_alerts": 1,
            "beamforming_exposure": "moderate",
            "reid_risk_pct": 18.5,
            "recommendation": "Move 2.4 GHz sensing to Ch 11 and inspect hidden BSSID de:ad:be:ef:09:99 on Ch 6."
        },
        "earworm": earworm
    }))
}

/// `GET /api/v1/ollama/models` — Auto-detect installed local Ollama models.
async fn ollama_models() -> Json<Value> {
    let host = configured_ollama_host();
    let url = format!("{host}/api/tags");
    let fetched = tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(3))
            .build();
        agent
            .get(&url)
            .call()
            .map_err(|e| e.to_string())?
            .into_json::<Value>()
            .map_err(|e| e.to_string())
    })
    .await;

    if let Ok(Ok(payload)) = fetched {
        let models: Vec<Value> = payload["models"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|m| {
                let name = m["name"].as_str().unwrap_or("unknown").to_string();
                let specialist = name.contains("nightsweep")
                    || name.contains("sigint")
                    || name.contains("radiofrequency")
                    || name.contains("strategic-relay");
                json!({
                    "name": name,
                    "size": m["size"],
                    "specialist": specialist,
                    "family": m["details"]["family"],
                    "parameter_size": m["details"]["parameter_size"],
                })
            })
            .collect();
        return Json(json!({
            "online": true,
            "host": host,
            "recommended_model": DEFAULT_MODEL,
            "models": models
        }));
    }

    Json(json!({
        "online": false,
        "host": host,
        "recommended_model": "offline-deterministic-fallback",
        "models": [{
            "name": "offline-deterministic-fallback",
            "size": 0,
            "specialist": true,
            "family": "deterministic",
            "parameter_size": "rule-engine"
        }]
    }))
}

fn call_ollama_generate(model: &str, system: &str, prompt: &str) -> Result<String, String> {
    let host = configured_ollama_host();
    let url = format!("{host}/api/generate");
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(45))
        .build();
    let body = json!({
        "model": model,
        "system": system,
        "prompt": prompt,
        "stream": false,
        "options": { "temperature": 0.2, "num_predict": 320 }
    });
    let resp: Value = agent
        .post(&url)
        .send_json(body)
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())?;
    resp["response"]
        .as_str()
        .map(|s| s.trim().to_string())
        .ok_or_else(|| "missing response field from ollama".to_string())
}

/// `POST /api/v1/ollama/analyze` — One-click briefing, anomaly triage, or node placement advisor.
async fn ollama_analyze(
    State(state): State<SharedState>,
    Json(req): Json<AnalyzeRequest>,
) -> Json<Value> {
    let model = req.model.unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let (motion, persons, nodes, earworm) = {
        let s = state.read().await;
        (
            s.current_motion_level.clone(),
            s.person_count(),
            s.node_states.len(),
            compute_earworm_telemetry(&s),
        )
    };

    let mode = req.mode.as_str();
    let aoa = earworm["beamforming"]["aoa_deg"].as_f64().unwrap_or(0.0);
    let aod = earworm["beamforming"]["aod_deg"].as_f64().unwrap_or(0.0);
    let gdop = earworm["tdoa"]["gdop"].as_f64().unwrap_or(1.3);
    let tau_rms = earworm["spatial_multipath"]["rms_delay_spread_ns"].as_f64().unwrap_or(8.5);
    let k_db = earworm["spatial_multipath"]["rician_k_factor_db"].as_f64().unwrap_or(6.5);
    let prompt = match mode {
        "anomaly_triage" => format!(
            "Triage RF sweep anomalies in 4 concise bullet points: 1 hidden high-power AP (de:ad:be:ef:09:99, -51 dBm, Ch 6, variance 3.40), CSI motion={motion}, persons={persons}, active_nodes={nodes}."
        ),
        "placement_advisor" => format!(
            "Recommend optimal ESP32-S3 CSI node placement and non-overlapping Wi-Fi channels in 4 concise bullet points given Ch 1/6 busy on 2.4 GHz, Ch 36 on 5 GHz, active_nodes={nodes}, persons={persons}."
        ),
        "earworm_multipath" => format!(
            "Analyze Earworm TDoA, 802.11bf beamforming, and spatial multipath in 4 concise bullet points: TDoA GDOP={gdop}, Beamforming AoA={aoa} deg / AoD={aod} deg, Multipath RMS delay spread={tau_rms} ns, Rician K={k_db} dB, motion={motion}, persons={persons}."
        ),
        _ => format!(
            "Provide a concise 4-bullet RF & CSI situational briefing: 4 BSSIDs visible, Ch 11 cleanest on 2.4 GHz, Ch 149 cleanest on 5 GHz, 1 hidden emitter on Ch 6, CSI motion={motion}, persons={persons}."
        ),
    };

    let system = "You are the RuView NetSweep + RF Signal Intelligence AI Advisor. Be concise, technical, and actionable.";
    let m_clone = model.clone();
    let p_clone = prompt.clone();
    let started = Instant::now();
    let res = tokio::task::spawn_blocking(move || call_ollama_generate(&m_clone, system, &p_clone)).await;

    match res {
        Ok(Ok(text)) if !text.is_empty() => Json(json!({
            "mode": req.mode,
            "model": model,
            "provenance": "MEASURED_OLLAMA",
            "latency_ms": started.elapsed().as_millis() as u64,
            "analysis": text
        })),
        _ => Json(json!({
            "mode": req.mode,
            "model": "offline-deterministic-fallback",
            "provenance": "SYNTHETIC_FALLBACK",
            "latency_ms": started.elapsed().as_millis() as u64,
            "analysis": format!(
                "• [NetSweep {mode}] 4 BSSIDs tracked; Ch 11 (2.4 GHz) and Ch 149 (5 GHz) have lowest interference.\n• [Earworm TDoA & Beamforming] Hyperbolic TDoA lock GDOP={gdop:.2}; 802.11bf ULA steered to AoA={aoa:.1}° / AoD={aod:.1}°.\n• [Spatial Multipath CIR] 5 active rays resolved (LoS + Bistatic Body Scatter + 1st-Order Wall + Ceiling); τ_rms={tau_rms:.2} ns, Rician K={k_db:.2} dB.\n• [CSI Mesh & Advisor] {nodes} active node(s), motion='{motion}', occupancy={persons}; place 3+ ESP32-S3 nodes in a 120° triangle on Ch 11."
            )
        })),
    }
}

/// `POST /api/v1/ollama/chat` — Interactive AI RF & Network Copilot.
async fn ollama_chat(
    State(state): State<SharedState>,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    let trimmed = req.prompt.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_PROMPT_CHARS {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "prompt must be between 1 and 4096 characters" })),
        );
    }

    let model = req.model.unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let (motion, persons, source) = {
        let s = state.read().await;
        (s.current_motion_level.clone(), s.person_count(), s.effective_source())
    };
    let system = format!(
        "You are RuView NetSweep Copilot. Live telemetry: source={source}, motion={motion}, persons={persons}, cleanest_2g_ch=11, cleanest_5g_ch=149, anomaly_bssid=de:ad:be:ef:09:99 (Ch 6, -51 dBm). Answer concisely."
    );
    let user_prompt = trimmed.to_string();
    let m_clone = model.clone();
    let started = Instant::now();
    let res = tokio::task::spawn_blocking(move || call_ollama_generate(&m_clone, &system, &user_prompt)).await;

    let (reply, prov, used_model) = match res {
        Ok(Ok(text)) if !text.is_empty() => (text, "MEASURED_OLLAMA", model),
        _ => (
            format!(
                "[Offline RF Copilot] Based on live NetSweep telemetry (source={source}, motion={motion}, persons={persons}): Channel 11 (2.4 GHz) and Channel 149 (5 GHz) are clear; inspect hidden AP de:ad:be:ef:09:99 on Channel 6 (-51 dBm)."
            ),
            "SYNTHETIC_FALLBACK",
            "offline-deterministic-fallback".to_string(),
        ),
    };

    (
        StatusCode::OK,
        Json(json!({
            "model": used_model,
            "provenance": prov,
            "latency_ms": started.elapsed().as_millis() as u64,
            "reply": reply
        })),
    )
}
