import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NetSweepOllamaService,
  validateOllamaHost,
  validatePlutoUri,
} from '../services/netsweep-ollama.service.js';

test('validateOllamaHost allows loopback only (SSRF guard) and validatePlutoUri validates libiio URIs', () => {
  assert.equal(validateOllamaHost('http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
  assert.equal(validateOllamaHost('http://localhost:11434/api'), 'http://localhost:11434');
  assert.equal(validateOllamaHost('http://169.254.169.254/latest'), null);
  assert.equal(validateOllamaHost('https://evil.example.com:11434'), null);

  assert.equal(validatePlutoUri('ip:192.168.2.1'), 'ip:192.168.2.1');
  assert.equal(validatePlutoUri('usb:1.5.5'), 'usb:1.5.5');
  assert.equal(validatePlutoUri('ip:192.168.2.1;rm -rf /'), null);
});

test('EnhancedTimeReversalSimulator (computeTimeReversal) + Earworm TDoA/Beamforming/Multipath + Dual-Mode PlutoSDR', async () => {
  const svc = new NetSweepOllamaService();
  const tr = svc.computeTimeReversal([2, 4], 0.12);
  assert.equal(tr.num_paths, 6);
  assert.deepEqual(tr.blocked_paths, [2, 4]);
  assert.equal(tr.original_pulse.length, 60);
  assert.ok(tr.scrambled_baseline.length > 60);
  assert.ok(tr.focused_result.length > tr.scrambled_baseline.length);
  assert.ok(tr.peak_to_rms_ratio > 1.5);

  const ew = svc.computeSyntheticEarworm([1.2, 1.3, -0.4]);
  assert.equal(ew.tdoa.pairs.length, 5);
  assert.equal(ew.beamforming.polar_spectrum.length, 13);
  assert.equal(ew.spatial_multipath.paths.length, 5);
  assert.ok(ew.time_reversal);
  assert.ok(ew.glowworm_burst);
  assert.equal(ew.glowworm_burst.rx_lo_hz, 868300000);
  assert.equal(ew.glowworm_burst.sample_rate_hz, 2000000);
  assert.equal(ew.glowworm_burst.rx_buffer_size, 10000);
  assert.equal(ew.glowworm_burst.rx_hardwaregain_chan0, 20);
  assert.equal(ew.glowworm_burst.threshold_db, -30);
  assert.equal(ew.glowworm_burst.signal_detected, true);
  assert.equal(ew.glowworm_burst.power_profile_db.length, 160);

  const modeRes = await svc.setExecutionMode('real', { uri: 'ip:192.168.2.1', center_freq_mhz: 2437 });
  assert.equal(modeRes.executionMode, 'real');
  assert.equal(modeRes.plutoConfig.uri, 'ip:192.168.2.1');
});

test('runSweep returns RF BSSID sweep, CSI mesh nodes, and passive RF privacy audit', async () => {
  const svc = new NetSweepOllamaService();
  const sweep = await svc.runSweep();
  assert.equal(sweep.rf_sweep.bssid_count, 4);
  assert.equal(sweep.rf_sweep.recommended_channels.band_2_4ghz, 11);
  assert.equal(sweep.rf_sweep.recommended_channels.band_5ghz, 149);
  assert.ok(sweep.csi_mesh.active_nodes >= 1);
  assert.equal(sweep.privacy_audit.rogue_ap_alerts, 1);
  assert.equal(sweep.provenance, 'SYNTHETIC');
});

test('fetchModels auto-detects local Ollama models and falls back when offline', async () => {
  const svc = new NetSweepOllamaService();
  const live = await svc.fetchModels();
  assert.ok(Array.isArray(live.models) && live.models.length >= 1);
  if (live.online) {
    console.log('[SHOWCASE] Detected Live Ollama Models:', live.models.map((m) => m.name).join(', '));
  }

  // Verify deterministic offline fallback on unreachable port
  svc.ollamaHost = 'http://127.0.0.1:59999';
  const offline = await svc.fetchModels();
  assert.equal(offline.online, false);
  assert.equal(offline.recommended_model, 'offline-deterministic-fallback');
});

test('analyzeSweep and chat work with live Ollama and offline fallback', async () => {
  const svc = new NetSweepOllamaService();
  const info = await svc.fetchModels();
  const fastModel = info.models.some((m) => m.name === 'strategic-relay:latest')
    ? 'strategic-relay:latest'
    : svc.selectedModel;

  const briefing = await svc.analyzeSweep('briefing', fastModel);
  assert.ok(briefing.analysis.length > 20);
  console.log(`\n[SHOWCASE] Mode=${briefing.mode} | Model=${briefing.model} | Provenance=${briefing.provenance} (${briefing.latency_ms}ms):\n${briefing.analysis}\n`);

  const chatRes = await svc.chat('Which channels should we use and what is the rogue AP on Channel 6?', fastModel);
  assert.ok(chatRes.reply.length > 20);
  console.log(`[SHOWCASE] Copilot Chat | Model=${chatRes.model} | Provenance=${chatRes.provenance} (${chatRes.latency_ms}ms):\n${chatRes.reply}\n`);
});
