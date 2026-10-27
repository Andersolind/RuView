import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetSweepOllamaService, validateOllamaHost } from '../services/netsweep-ollama.service.js';

test('validateOllamaHost allows loopback only (SSRF guard)', () => {
  assert.equal(validateOllamaHost('http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
  assert.equal(validateOllamaHost('http://localhost:11434/api'), 'http://localhost:11434');
  assert.equal(validateOllamaHost('http://169.254.169.254/latest'), null);
  assert.equal(validateOllamaHost('https://evil.example.com:11434'), null);
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

test('analyzeSweep and chat work with live Ollama (nightsweep-sigint:latest) and offline fallback', async () => {
  const svc = new NetSweepOllamaService();
  await svc.fetchModels();

  const briefing = await svc.analyzeSweep('briefing', svc.selectedModel);
  assert.ok(briefing.analysis.length > 20);
  console.log(`\n[SHOWCASE] Mode=${briefing.mode} | Model=${briefing.model} | Provenance=${briefing.provenance} (${briefing.latency_ms}ms):\n${briefing.analysis}\n`);

  const chatRes = await svc.chat('Which channels should we use and what is the rogue AP on Channel 6?', svc.selectedModel);
  assert.ok(chatRes.reply.length > 20);
  console.log(`[SHOWCASE] Copilot Chat | Model=${chatRes.model} | Provenance=${chatRes.provenance} (${chatRes.latency_ms}ms):\n${chatRes.reply}\n`);
});
