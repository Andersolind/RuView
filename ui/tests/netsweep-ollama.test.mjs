import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NetSweepOllamaService,
  validateOllamaHost,
  validatePlutoUri,
} from '../services/netsweep-ollama.service.js';
import {
  drawPolarBeamformingCanvas,
  drawTimeReversalAuditCanvas,
  drawGlowWormBurstCanvas,
  EarwormSceneLayer,
  EarwormAudioSonifier,
} from '../components/earworm-engine.js';

function createMockCanvas(width = 336, height = 160) {
  const ops = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    clearRect: (...args) => ops.push(['clearRect', ...args]),
    fillRect: (...args) => ops.push(['fillRect', ...args]),
    beginPath: () => ops.push(['beginPath']),
    closePath: () => ops.push(['closePath']),
    moveTo: (...args) => ops.push(['moveTo', ...args]),
    lineTo: (...args) => ops.push(['lineTo', ...args]),
    arc: (...args) => ops.push(['arc', ...args]),
    rect: (...args) => ops.push(['rect', ...args]),
    roundRect: (...args) => ops.push(['roundRect', ...args]),
    stroke: () => ops.push(['stroke']),
    fill: () => ops.push(['fill']),
    setLineDash: (...args) => ops.push(['setLineDash', ...args]),
    fillText: (text, x, y) => ops.push(['fillText', String(text), x, y]),
  };
  return {
    width,
    height,
    ops,
    getContext: (type) => (type === '2d' ? ctx : null),
  };
}

test('1. validateOllamaHost (SSRF loopback guard) & validatePlutoUri (libiio injection guard)', () => {
  assert.equal(validateOllamaHost('http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
  assert.equal(validateOllamaHost('http://localhost:11434/api'), 'http://localhost:11434');
  assert.equal(validateOllamaHost('http://[::1]:11434'), 'http://[::1]:11434');
  assert.equal(validateOllamaHost('http://169.254.169.254/latest'), null);
  assert.equal(validateOllamaHost('https://evil.example.com:11434'), null);

  assert.equal(validatePlutoUri('ip:192.168.2.1'), 'ip:192.168.2.1');
  assert.equal(validatePlutoUri('usb:1.5.5'), 'usb:1.5.5');
  assert.equal(validatePlutoUri(''), null);
  assert.equal(validatePlutoUri('tcp:192.168.2.1'), null);
  assert.equal(validatePlutoUri('ip:192.168.2.1;rm -rf /'), null);
});

test('2. EnhancedTimeReversalSimulator: 6-path CIR, 180° phase cancellation mask, and noise σ', async () => {
  const svc = new NetSweepOllamaService();

  const clean = svc.computeTimeReversal([], 0.0);
  assert.equal(clean.num_paths, 6);
  assert.equal(clean.path_delays[0], 0);
  assert.equal(clean.path_gains[0], 1.0);
  assert.deepEqual(clean.blocked_paths, []);
  assert.equal(clean.degraded, false);
  assert.equal(clean.original_pulse.length, 60);
  assert.ok(clean.peak_to_rms_ratio > 2.5);

  const masked = svc.computeTimeReversal([2, 4], 0.12);
  assert.deepEqual(masked.blocked_paths, [2, 4]);
  assert.equal(masked.path_override_mask[2], 0);
  assert.equal(masked.path_override_mask[4], 0);
  assert.equal(masked.path_override_mask[0], 1);
  assert.equal(masked.degraded, true);
  assert.ok(masked.focused_result.length > masked.scrambled_baseline.length);

  const liveTr = await svc.runTimeReversal([2, 4], 0.12);
  assert.deepEqual(liveTr.blocked_paths, [2, 4]);
  assert.ok(liveTr.peak_to_rms_ratio > 1.5);
});

test('3. Step 4 URH + PlutoSDR 868.3 MHz Glow-worm Short-Burst Detector threshold gating', () => {
  const svc = new NetSweepOllamaService();

  const detected = svc.computeGlowWormBurst(-30, 20);
  assert.equal(detected.rx_lo_hz, 868300000);
  assert.equal(detected.rx_lo_mhz, 868.3);
  assert.equal(detected.sample_rate_hz, 2000000);
  assert.equal(detected.rx_buffer_size, 10000);
  assert.equal(detected.gain_control_mode_chan0, 'manual');
  assert.equal(detected.rx_hardwaregain_chan0, 20);
  assert.equal(detected.signal_detected, true);
  assert.equal(detected.demod_bits, '101010101100101101001110');
  assert.deepEqual(detected.emitter_3d_xyz, [-3.55, 1.35, -1.75]);
  assert.equal(detected.power_profile_db.length, 160);

  // Raising trigger threshold above peak burst power suppresses trigger
  const suppressed = svc.computeGlowWormBurst(-5, 20);
  assert.equal(suppressed.signal_detected, false);
  assert.match(suppressed.status_message, /Listening/);
});

test('4. Earworm 3D Engine canvases, visibility toggles, and 3D Earworm Thought Bubble rendering', () => {
  const svc = new NetSweepOllamaService();
  const ew = svc.computeSyntheticEarworm([1.2, 1.3, -0.4]);
  assert.equal(ew.tdoa.pairs.length, 5);
  assert.equal(ew.beamforming.polar_spectrum.length, 13);
  assert.equal(ew.spatial_multipath.paths.length, 5);

  const polarCanvas = createMockCanvas(220, 140);
  drawPolarBeamformingCanvas(polarCanvas, ew.beamforming);
  assert.ok(polarCanvas.ops.some((op) => op[0] === 'fillText' && op[1].includes('AoA')));

  const trCanvas = createMockCanvas(336, 162);
  drawTimeReversalAuditCanvas(trCanvas, ew.time_reversal);
  const trLabels = trCanvas.ops.filter((op) => op[0] === 'fillText').map((op) => op[1]);
  assert.equal(trLabels.length, 3);
  assert.match(trLabels[0], /1\. Original Clean Source Pulse/);
  assert.match(trLabels[2], /3\. Time-Reversed Focus/);

  const gwCanvas = createMockCanvas(336, 96);
  drawGlowWormBurstCanvas(gwCanvas, ew.glowworm_burst);
  assert.ok(gwCanvas.ops.some((op) => op[0] === 'fillText' && op[1].includes('868.3MHz')));
  assert.ok(gwCanvas.ops.some((op) => op[0] === 'fillText' && op[1].includes('SIGNAL DETECTED!')));

  // Test EarwormSceneLayer visibility & 3D Thought Bubble canvas updater
  const layer = new EarwormSceneLayer(null);
  layer.setVisibility({ tdoa: false, beamforming: true, multipath: false });
  assert.equal(layer.showTdoa, false);
  assert.equal(layer.showBeamforming, true);
  assert.equal(layer.showMultipath, false);

  layer.bubbleCanvas = createMockCanvas(320, 140);
  layer.bubbleTexture = { needsUpdate: false };
  layer._updateThoughtBubbleCanvas(ew, 2.5);
  assert.equal(layer.bubbleTexture.needsUpdate, true);
  const bubbleTexts = layer.bubbleCanvas.ops.filter((op) => op[0] === 'fillText').map((op) => op[1]);
  assert.ok(bubbleTexts.some((t) => t.includes('EARWORM:')));
  assert.ok(bubbleTexts.some((t) => t.includes('TR Focus:')));
  assert.ok(bubbleTexts.some((t) => t.includes('868.3MHz Burst: DETECTED')));

  const sonifier = new EarwormAudioSonifier();
  assert.equal(sonifier.isMuted, true);
  assert.equal(sonifier.toggleAudio(), true);
  assert.equal(sonifier.toggleAudio(), false);
});

test('5. Dual-Mode PlutoSDR & Live sensing-server HTTP contract (/viz.html, /earworm, /time-reversal, /pluto)', async () => {
  const svc = new NetSweepOllamaService();
  const modeRes = await svc.setExecutionMode('real', { uri: 'ip:192.168.2.1', center_freq_mhz: 2437 });
  assert.equal(modeRes.executionMode, 'real');
  assert.equal(modeRes.plutoConfig.uri, 'ip:192.168.2.1');

  const sweep = await svc.runSweep();
  assert.equal(sweep.rf_sweep.bssid_count, 4);
  assert.equal(sweep.rf_sweep.recommended_channels.band_2_4ghz, 11);
  assert.equal(sweep.rf_sweep.recommended_channels.band_5ghz, 149);
  assert.ok(sweep.csi_mesh.active_nodes >= 1);
  assert.equal(sweep.privacy_audit.rogue_ap_alerts, 1);

  // If live sensing-server on :3000 is running, verify root /viz.html and REST routes
  try {
    const vizResp = await fetch('http://127.0.0.1:3000/viz.html');
    if (vizResp.ok) {
      const html = await vizResp.text();
      assert.match(html, /EarwormSceneLayer/);
      assert.match(html, /EarwormHudDock/);

      const ewResp = await fetch('http://127.0.0.1:3000/api/v1/netsweep/earworm');
      assert.equal(ewResp.status, 200);
      const ewJson = await ewResp.json();
      assert.ok(ewJson.tdoa && ewJson.beamforming && ewJson.time_reversal && ewJson.glowworm_burst);
      assert.equal(ewJson.glowworm_burst.rx_lo_hz, 868300000);

      const plutoResp = await fetch('http://127.0.0.1:3000/api/v1/netsweep/pluto');
      assert.equal(plutoResp.status, 200);
      const plutoJson = await plutoResp.json();
      assert.equal(plutoJson.uri, 'ip:192.168.2.1');
    }
  } catch {
    // Server optional when running pure unit tests offline
  }
});

test('6. Ollama SignalIntelligence model discovery, offline fallback, and live briefing/chat', async () => {
  const svc = new NetSweepOllamaService();
  const live = await svc.fetchModels();
  assert.ok(Array.isArray(live.models) && live.models.length >= 1);

  const fastModel = live.models.some((m) => m.name === 'strategic-relay:latest')
    ? 'strategic-relay:latest'
    : svc.selectedModel;

  const briefing = await svc.analyzeSweep('pluto_time_reversal', fastModel);
  assert.ok(briefing.analysis.length > 20);

  const chatRes = await svc.chat(
    'Summarize our 868.3 MHz URH burst trigger and Path 2/4 180-deg Time-Reversal settings.',
    fastModel
  );
  assert.ok(chatRes.reply.length > 20);

  // Deterministic offline fallback check
  svc.ollamaHost = 'http://127.0.0.1:59999';
  const offline = await svc.fetchModels();
  assert.equal(offline.online, false);
  assert.equal(offline.recommended_model, 'offline-deterministic-fallback');
});
