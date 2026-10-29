# RuView + NightSweep Ollama SignalIntelligence & Strategic Relay Models

This directory documents the Ollama model stack integrated across **RuView (`wifi-densepose` v2.0)**, **NightSweep**, and **Strategic Relay**:

## Custom Project Models

### 1. `strategic-relay` (`4.7 GB` | `num_ctx 8192` | `temperature 0.2`)
> **Summary:** Air-gapped Strategic Acoustic & RF Relay, Open-Set Specific Emitter Identification (SEI), Optical ToF Multipath, and Integrated Sensing & Communications (ISAC) neural reasoning engine.

- **Open-Set Specific Emitter Identification (SEI):** Hardware RF-DNA fingerprinting via IQ gain/phase imbalance, LO phase noise, PA turn-on transient kurtosis, CFO drift, and Extreme Value Theory (Weibull/Gumbel) rogue clone rejection.
- **Integrated Sensing & Communications (ISAC) & Multi-Room Vitals:** 915 MHz / 2.4 GHz ISM / 5G micro-Doppler & phase tracking (`2.0 MSPS`, `8192` buffer, `54 dB` manual RX gain) with 2nd-order Butterworth (`1.0–2.1 Hz`) + FFT cardiac BPM extraction and cyclic multi-room handoffs (`Staircase Base`, `Bedroom Floor`, `Washroom Mirror`).
- **Optical ToF & 3D Multipath Deconvolution:** Dual-frequency (`20 MHz + 80 MHz`) Optical Time-of-Flight Multipath Interference (MPI) separation, 6-path `180°` Time-Reversal Mirror (TRM) phase cancellation, and 3D Kalman Z-echo rejection.
- **Spatial Audio & Orthogonal SSB:** Kaiser-Bessel (`-42.6 dB` SLL) anti-foaming beam shaping, US6631196B1 square-root pre-distortion, `-48 dB` LCMV per-path blockers, 3-target Orthogonal Complex SSB (`-250 / 0 / +250 kHz`), and psychoacoustic binaural/aspect gating.

### 2. `nightsweep-sigint` (`4.7 GB` | `num_ctx 8192` | `temperature 0.25`)
> **Summary:** Air-gapped Signals Intelligence (SIGINT), Acoustic Counter-Surveillance, Multi-Domain TSCM, and Autonomous SDR Telemetry Advisor.

- **Autonomous SDR & Spectrum Guard:** Real-time parameter tuning and telemetry diagnostics for ADALM-Pluto (AD9363), HackRF One, and RTL-SDR V4, plus CBRS Band 48 / 5G NR n48 Spectral Emission Mask (SEM) compliance.
- **10x Multi-Domain TSCM Intercept Matrix:** Power-Line Conducted Emissions (`PLEI`), Magnetometer TEMPEST (`0.1 Hz–50 kHz`), Non-Linear Junction Detection (`2f0 / 3f0` harmonic ratioing), Acoustic Bragg Radar, Chirp Spread Spectrum (`LoRa / BLE` AoA), GNSS spoofing defense, and PLC steganalysis.
- **Acoustic Counter-Surveillance & Voice Defense:** 3D shotgun gimbal kinematics + Neural AEC (`ERLE >= 25 dB`), `18–40 kHz` ultrasonic jammer & Berktay parametric array detection, Dodotronic 192 kHz + PANNs Cnn14 + HuBERT synthetic voice-clone defense, and stenograph chording (`dt <= 35 ms`) steganalysis.
- **Safety Interlocks:** Enforces `GREEN / AMBER / RED` acoustic SPL (`<= 85 dBA`), ultrasonic (`<= 100 dBSPL`), and AD9363 bench attenuation limits (`0–80 dB` TX).

### 3. `nightsweep-signalintelligence` (`4.7 GB` | `num_ctx 8192` | `temperature 0.2`)
> **Summary:** Multi-modal Neural SIGINT, WiFi-DensePose (`RuView`) 3D Spatial CSI Sensing, Time-Reversal Multipath Focusing, and Live PlutoSDR Hardware-in-the-Loop Advisor.

- **WiFi-DensePose (`RuView` v2.0) 3D Spatial Sensing:** Interprets 56-subcarrier 802.11n/ac/ax Channel State Information (CSI), `MERIDIAN` geometry encoding, `AETHER` 128-dim contrastive person re-ID, 17-keypoint 3D human pose estimation, and `CompressedHE80` beamforming feedback matrices.
- **3D Time-Reversal Multipath Focusing:** Computes specular wall bounce delays and `180°` phase-inverted cancellation vectors (`EnhancedTimeReversalSimulator`) to suppress ambient room echo while constructively focusing acoustic/RF energy at a target coordinate.
- **Live ADALM-Pluto Hardware-in-the-Loop Control:** Advises real-time RX hardware gain (`0–70 dB`, `±2 dB` steps) and TX attenuation (`-89 to 0 dB`) tuning alongside 2.4 GHz ISM multi-room cardiac/motion telemetry (`MultiRoomSDRProcessor`).
- **Sub-GHz Burst & Protocol Intelligence:** Real-time `868.3 MHz` SRD/IoT short-burst anomaly detection (`PlutoGlowWormBurstDetector`) and Universal Radio Hacker (URH) FSK/OOK/ASK modulation reverse engineering.

## Companion / Base Models

| Model | Size | Role |
|---|---|---|
| `dolphin-llama3:8b` | 4.7 GB | Uncensored Llama-3 8B base foundation used to build `nightsweep-sigint`, `nightsweep-signalintelligence`, and `strategic-relay`. |
| `ALIENTELLIGENCE/radiofrequencyengineer:latest` | 4.7 GB | Companion RF engineering specialist for link budgets, antenna design, impedance matching, and propagation checks. |
| `hf.co/dphn/Dolphin3.0-Llama3.1-8B-GGUF` (`Q4_K_M` / `Q4_0`) | 4.7–4.9 GB | Updated Dolphin 3.0 (Llama 3.1 8B) quantized GGUF fallback weights. |
| `llama3.2:latest` | 2.0 GB | Lightweight 3B fast-inference fallback model for low-latency edge queries. |
| `glm-4.7-flash:latest` | 19 GB | High-capacity reasoning and code-synthesis model for deep offline protocol analysis and multi-sensor log audits. |

## Build / Update Locally in Ollama
```bash
ollama create nightsweep-signalintelligence:latest -f scripts/ollama/Modelfile.nightsweep-signalintelligence
ollama create nightsweep-sigint:latest -f scripts/ollama/Modelfile.nightsweep-signalintelligence
```
