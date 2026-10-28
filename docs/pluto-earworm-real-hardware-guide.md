# RuView 3D Room: Full Real-Equipment Implementation & Setup Guide
**ADALM-Pluto SDR (AD9363/AD9364) + ESP32-S3 CSI Mesh + URH 868.3 MHz Burst + Earworm 3D Time-Reversal Mirror**

> **Provenance Contract (`AGENTS.md`)**: When physical hardware is connected and verified via `libiio` / `pyadi-iio` and UDP `5005` CSI frames, telemetry is tagged `MEASURED`. When hardware is disconnected, the system automatically falls back to `SYNTHETIC` Demo mode and reports the fallback honestly.

---

## 1. Real Equipment Bill of Materials (BOM)

| Subsystem | Hardware Component | Role in 3D Room |
|---|---|---|
| **SDR Core (Time-Reversal & 868.3 MHz Burst)** | **ADALM-Pluto SDR** (Rev C / Pluto+ with AD9363 unlocked to AD9364 `70 MHz – 6 GHz`) | 2.4 GHz CIR sounding & Time-Reversal Mirror + `868.3 MHz` (`2.0 MSPS`) Glow-worm burst capture |
| **RF Protection & Cabling** | `30 dB` SMA inline attenuator (for loopback calibration) + 2x `868 MHz / 2.4 GHz` dipole antennas | Prevents AD9363 RX front-end saturation (`max input -10 dBm`) |
| **Wi-Fi CSI Mesh (TDoA & 802.11bf)** | **3x to 6x ESP32-S3-DevKitC-1 (N8R8)** with external `5 dBi` IPEX antennas | Streams IEEE 802.11 CSI amplitude/phase over UDP port `5005` to `sensing-server` |
| **Acoustic TDoA & HRTF Monitoring** | USB Measurement Microphone (or 4-MEMS array / UltraMic) + Stereo Headphones | Live acoustic TDoA cross-correlation & WebAudio 3D HRTF binaural monitoring |
| **Local AI Signal Intelligence** | Workstation running **Ollama** (`127.0.0.1:11434`) with `nightsweep-signalintelligence:latest` | Real-time CIR phase-nulling, URH burst triage, and 802.11bf steering guidance |

---

## 2. Physical 3D Room Placement (`8m × 6m × 3m` Coordinate Frame)

 Match the physical anchor coordinates to [environment.js](file:///home/anders/HackRf/BlueDucky/RuView/ui/components/environment.js) and [earworm-engine.js](file:///home/anders/HackRf/BlueDucky/RuView/ui/components/earworm-engine.js):

1. **North Wall Transmitters (`z = -2.8m`, elevation `y = 2.5m`)**:
   - `TX1`: `[-3.5m, 2.5m, -2.8m]` (ESP32-S3 Node #1)
   - `TX2`: `[ 0.0m, 2.5m, -2.8m]` (ADALM-Pluto SDR `TX1` / Reference Anchor)
   - `TX3`: `[+3.5m, 2.5m, -2.8m]` (ESP32-S3 Node #2)
2. **South Wall Receivers (`z = +2.8m`, elevation `y = 2.5m`)**:
   - `RX1`: `[-3.5m, 2.5m, +2.8m]` (ESP32-S3 Node #3)
   - `RX2`: `[ 0.0m, 2.5m, +2.8m]` (ADALM-Pluto SDR `RX1` / Primary AoA Anchor)
   - `RX3`: `[+3.5m, 2.5m, +2.8m]` (ESP32-S3 Node #4)
3. **868.3 MHz SRD Burst Monitor Zone**:
   - West/North utility wall at `[-3.55m, 1.35m, -1.75m]`.

---

## 3. Step-by-Step Host & Hardware Setup

### Step 3.1: Install ADALM-Pluto SDR (`libiio` & `pyadi-iio`) and URH
```bash
# 1. Install system libiio utilities & Python bindings
sudo apt-get update && sudo apt-get install -y libiio0 libiio-utils iio-oscilloscope
pip install pyadi-iio pylibiio numpy scipy matplotlib urh

# 2. Plug in ADALM-Pluto SDR via USB and verify USB Ethernet interface (192.168.2.1)
iio_info -u ip:192.168.2.1 | grep -E "ad9361-phy|cf-ad9361"
```

### Step 3.2: Unlock ADALM-Pluto SDR Extended Frequency Range (Optional for 70 MHz – 6 GHz)
```bash
iio_attr -u ip:192.168.2.1 -D ad9361-phy adi,2rx-2tx-mode-enable
# If needed via serial/SSH on Pluto:
# fw_setenv attr_name compatible && fw_setenv attr_val ad9364 && reboot
```

### Step 3.3: Run Real-Hardware Time-Reversal CIR Sounding & 868.3 MHz Burst Capture
Use [pluto_earworm_time_reversal.py](file:///home/anders/HackRf/BlueDucky/RuView/scripts/pluto_earworm_time_reversal.py) to execute:
1. **2.4 GHz (`2437 MHz`) Gaussian Pulse CIR Deconvolution & $180^\circ$ Wall-Path Nulling** (`EnhancedTimeReversalSimulator` + `PlutoSDRTimeReversalBridge`)
2. **868.3 MHz (`2.0 MSPS`, `10,000` samples, `20 dB` manual gain) Short-Burst Detection** (`PlutoGlowWormBurstDetector`)
3. **Live `nightsweep-signalintelligence:latest` Guidance**

```bash
python3 scripts/pluto_earworm_time_reversal.py \
  --mode real \
  --pluto-uri ip:192.168.2.1 \
  --freq-mhz 2437.0 \
  --block 2 4 \
  --noise 0.12 \
  --ask-ollama \
  --save-plot /tmp/pluto_time_reversal_measured.png
```

### Step 3.4: Universal Radio Hacker (URH) 868.3 MHz Burst Capture Workflow
1. **Capture IQ Frame via PlutoSDR (`868.3 MHz`, `2.0 MSPS`, `10,000` samples)**:
   - The detector in [`PlutoGlowWormBurstDetector.capture_or_simulate_burst`](file:///home/anders/HackRf/BlueDucky/RuView/scripts/pluto_earworm_time_reversal.py#L349-L408) configures:
     - `sdr.sample_rate = int(2e6)`
     - `sdr.rx_lo = int(868.3e6)`
     - `sdr.rx_rf_bandwidth = int(2e6)`
     - `sdr.rx_buffer_size = 10000`
     - `sdr.gain_control_mode_chan0 = "manual"`
     - `sdr.rx_hardwaregain_chan0 = 20`
   - Calculates burst power `power = 10 * np.log10(np.abs(rx_data)**2)` and triggers when `np.max(power) > -30` dB.
2. **Inspect in URH**:
   - Open `urh` → **File → Record Signal** → Device: `PlutoSDR`, Frequency: `868.3e6`, Sample Rate: `2e6`, Gain: `20`.
   - In the **Interpretation** tab, select **FSK** or **ASK/OOK**, set Noise Threshold above the noise floor (`~ -42 dB`), Bit Length `100` samples (`50 µs` @ `2 MSPS` = `20 kbps`), and verify preamble `10101010...`.

### Step 3.5: Flash & Stream Real ESP32-S3 CSI Nodes (Optional Multi-Anchor Mesh)
See [firmware/esp32-csi-node/README.md](file:///home/anders/HackRf/BlueDucky/RuView/firmware/esp32-csi-node/README.md) to flash ESP32-S3 nodes pointing to `<host-ip>:5005`, then start `sensing-server` in live hardware mode:
```bash
./v2/target/debug/sensing-server \
  --source esp32 \
  --udp-port 5005 \
  --http-port 3000 \
  --ws-port 3001 \
  --ui-path ./ui
```

### Step 3.6: Launch the 3D Room Visualization in `FULL REAL (PlutoSDR)` Mode
1. Open `http://127.0.0.1:3000/viz.html`.
2. In the bottom-left **EARWORM 3D + TIME-REVERSAL + PLUTO SDR** dock:
   - Enter Pluto URI (`ip:192.168.2.1` or `usb:1.5.5`) and select frequency (`2437 MHz` or `868.3 MHz`).
   - Click **`FULL REAL (PlutoSDR)`** — this calls `/api/v1/netsweep/pluto` and `/api/v1/netsweep/time-reversal` (`mode: "real"`).
   - Toggle `P0`–`P5` to apply $180^\circ$ CIR phase cancellation on wall reflections (`P2` West Wall, `P4` East Wall).
   - Click **`🔊 Audio [E]`** and **`🎙️ Mic TDoA`** to enable live WebAudio 3D HRTF sonification and microphone acoustic TDoA.
   - Click **`Ask SignalIntelligence`** to query `nightsweep-signalintelligence:latest` on the live telemetry.
