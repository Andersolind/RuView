# RuView + NightSweep Ollama SignalIntelligence Models

This directory contains the canonical Ollama `Modelfile` (`Modelfile.nightsweep-signalintelligence`) for:
- `nightsweep-signalintelligence:latest` (Primary default model in RuView NetSweep & Earworm 3D Room)
- `nightsweep-sigint:latest` (Synchronized alias)

## Included Domain Specializations (Sections 1–31)
- **Sections 1–30**: NightSweep SIGINT, Acoustic Directional Targeting, US6631196B1 Carrier Synchronization, Distributed Mic Capture, Steganalysis, Ultrasonic Jammer Detection, GPS-Anchored Multipath & Larsen Loops, Public RF Multipath Camera, CBRS Band 48, Real-Time TDoA/AoA/RSSI Multilateration, Situational DSP Filters, Parametric Mid-Air Demodulation, Duty-Cycle Audio Demodulation, Welford Baseline Learning, AI-Voice Triangulation, Whisper Capture, 10x Multi-Domain SIGINT Matrix, Full-Facility Telemetry Routing, 3D Linear Kalman Filter & Virtual Mics, PlutoSDR Dual-Stream Resampling & Auto-Ducker, Psychoacoustic Sidechain Duck Masking, Fernet Audit Ledger & Earworm Beam Anti-Foaming, Furniture Hotspot Triggers & Per-Path Override Blocker, Automated OTA/Loopback Validation, Orthogonal SSB 3-Target Multiplexing, Spatial Nulling & Predictive State Cache, SDR Aspect Gating & Left-Ear Binaural TV Engine, Multimodal Behavioral Splicing, RuView v2.0 Cross-Connect, and Multi-Room 2.4 GHz Bio-Radiometric SDR Processor.
- **Section 31**: RuView 3D Room Earworm Engine (`viz.html` + 3D Floating Earworm Thought Bubble), `EnhancedTimeReversalSimulator` (6-path CIR, $180^\circ$ destructive phase cancellation on wall reflections, `np.flip` focusing), and Step 4 URH + ADALM-Pluto SDR `868.3 MHz` (`2.0 MSPS`, `10,000` samples, `20 dB` manual gain, `-30 dB` trigger) Glow-worm Short-Burst Detector.

## Build / Update Locally in Ollama
```bash
ollama create nightsweep-signalintelligence:latest -f scripts/ollama/Modelfile.nightsweep-signalintelligence
ollama create nightsweep-sigint:latest -f scripts/ollama/Modelfile.nightsweep-signalintelligence
```
