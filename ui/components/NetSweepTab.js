// NetSweep & Local Ollama AI Tab Component

import { netSweepOllamaService } from '../services/netsweep-ollama.service.js';
import {
  drawPolarBeamformingCanvas,
  drawTimeReversalAuditCanvas,
  drawGlowWormBurstCanvas,
  EarwormAudioSonifier,
} from './earworm-engine.js';

export class NetSweepTab {
  constructor(container) {
    this.container = container;
    this.service = netSweepOllamaService;
    this.sonifier = new EarwormAudioSonifier();
  }

  async init() {
    this.renderShell();
    this.bindEvents();
    await this.refreshModels();
    await this.triggerSweep();
  }

  renderShell() {
    this.container.innerHTML = `
      <div class="netsweep-header">
        <div>
          <h2>NetSweep &amp; Ollama AI Advisor</h2>
          <p class="subtitle">Multi-BSSID RF Channel Sweep, CSI Mesh Node Discovery, Passive Privacy Audit &amp; Local Ollama Copilot</p>
        </div>
        <div class="netsweep-controls">
          <span id="ns-ollama-badge" class="ns-badge">Detecting Ollama...</span>
          <span id="ns-prov-badge" class="ns-badge">SYNTHETIC</span>
          <button id="ns-mode-demo" class="ns-btn primary">DEMO Mode</button>
          <button id="ns-mode-real" class="ns-btn">REAL (PlutoSDR)</button>
          <button id="ns-audio-btn" class="ns-btn">🔇 Earworm 3D Audio</button>
          <a href="viz.html" target="_blank" class="ns-btn" style="text-decoration:none;">Open 3D Room (viz.html)</a>
          <select id="ns-model-select" class="ns-select" aria-label="Select Ollama Model"></select>
          <button id="ns-scan-btn" class="ns-btn primary">Run NetSweep</button>
        </div>
      </div>

      <div class="netsweep-kpis" id="ns-kpis"></div>

      <div class="netsweep-grid">
        <div class="ns-card">
          <h3>1. Wi-Fi / Multi-BSSID RF Channel Sweep</h3>
          <div id="ns-bssid-list" class="ns-table-wrap"></div>
        </div>

        <div class="ns-card">
          <h3>2. CSI Mesh &amp; Sensor Node Sweep &amp; Privacy Audit</h3>
          <div id="ns-mesh-audit"></div>
        </div>

        <div class="ns-card">
          <h3>3. One-Click Ollama SignalIntelligence Briefings &amp; Advisor</h3>
          <div class="ns-action-row">
            <button class="ns-btn" data-mode="briefing">Sweep Briefing</button>
            <button class="ns-btn" data-mode="anomaly_triage">Anomaly Triage</button>
            <button class="ns-btn" data-mode="placement_advisor">Placement Advisor</button>
            <button class="ns-btn" data-mode="earworm_multipath">Earworm TDoA &amp; Multipath</button>
            <button class="ns-btn primary" data-mode="pluto_time_reversal">PlutoSDR + Time-Reversal Guide</button>
          </div>
          <pre id="ns-analysis-output" class="ns-output">Select an advisor mode above to run Ollama SignalIntelligence analysis on the live sweep.</pre>
        </div>

        <div class="ns-card">
          <h3>4. Interactive Ollama RF &amp; SignalIntelligence Copilot</h3>
          <div id="ns-chat-log" class="ns-chat-log"></div>
          <div class="ns-chat-input-row">
            <input id="ns-chat-input" class="ns-input" type="text" placeholder="Ask nightsweep-signalintelligence about PlutoSDR, Time-Reversal, TDoA, or 802.11bf..." />
            <button id="ns-chat-send" class="ns-btn primary">Ask Ollama</button>
          </div>
        </div>

        <div class="ns-card">
          <h3>5. Earworm TDoA Hyperbolic Localization &amp; 802.11bf Beamforming</h3>
          <div id="ns-tdoa-summary" class="ns-section-sub"></div>
          <canvas id="ns-polar-canvas" width="320" height="145" style="width:100%;border:1px solid #1e334d;border-radius:6px;margin:6px 0;"></canvas>
          <div id="ns-tdoa-table" class="ns-table-wrap"></div>
        </div>

        <div class="ns-card">
          <h3>6. 3D Room Spatial Multipath Ray-Tracing &amp; CIR Clusters</h3>
          <div id="ns-multipath-summary" class="ns-section-sub"></div>
          <div id="ns-multipath-table" class="ns-table-wrap"></div>
        </div>

        <div class="ns-card" style="grid-column: 1 / -1;">
          <h3>7. EnhancedTimeReversalSimulator + 180° CIR Phase Cancellation + ADALM-Pluto SDR</h3>
          <div id="ns-pluto-status" class="ns-section-sub"></div>
          <div class="ns-action-row" id="ns-tr-mask-row" style="margin:6px 0;"></div>
          <div style="display:flex;align-items:center;gap:10px;margin:6px 0;font-size:12px;">
            <label for="ns-noise-slider">Injected Noise Floor σ:</label>
            <input id="ns-noise-slider" type="range" min="0" max="0.30" step="0.01" value="0.12" />
            <span id="ns-noise-label">0.12 σ</span>
            <span>| Pluto URI:</span>
            <input id="ns-pluto-uri" class="ns-input" style="max-width:150px;" value="ip:192.168.2.1" />
          </div>
          <canvas id="ns-tr-canvas" width="760" height="210" style="width:100%;border:1px solid #1e334d;border-radius:6px;"></canvas>
        </div>

        <div class="ns-card" style="grid-column: 1 / -1;">
          <h3>8. Step 4: URH + ADALM-Pluto SDR 868.3 MHz Glow-worm Short-Burst Detector &amp; Demodulator</h3>
          <div id="ns-gw-status" class="ns-section-sub"></div>
          <div style="display:flex;align-items:center;gap:12px;margin:6px 0;font-size:12px;">
            <label for="ns-gw-thresh">Trigger Threshold (dB):</label>
            <input id="ns-gw-thresh" type="range" min="-45" max="-10" step="1" value="-30" />
            <span id="ns-gw-thresh-lbl">-30 dB</span>
            <span>| RX Hardware Gain: <code>20 dB (manual)</code> | Sample Rate: <code>2.0 MSPS</code> | Buffer: <code>10,000</code></span>
          </div>
          <canvas id="ns-gw-canvas" width="760" height="130" style="width:100%;border:1px solid #1e334d;border-radius:6px;"></canvas>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this.container.querySelector('#ns-scan-btn')?.addEventListener('click', () => this.triggerSweep());
    this.container.querySelector('#ns-model-select')?.addEventListener('change', (e) => {
      this.service.selectedModel = e.target.value;
    });
    this.container.querySelector('#ns-mode-demo')?.addEventListener('click', async () => {
      await this.service.setExecutionMode('demo');
      await this.triggerSweep();
    });
    this.container.querySelector('#ns-mode-real')?.addEventListener('click', async () => {
      const uri = this.container.querySelector('#ns-pluto-uri')?.value || 'ip:192.168.2.1';
      await this.service.setExecutionMode('real', { uri });
      await this.triggerSweep();
    });
    this.container.querySelector('#ns-audio-btn')?.addEventListener('click', (e) => {
      const on = this.sonifier.toggleAudio();
      e.target.textContent = on ? '🔊 Earworm 3D Audio ON' : '🔇 Earworm 3D Audio';
      if (on && this.service.lastEarworm) this.sonifier.update(this.service.lastEarworm);
    });
    this.container.querySelector('#ns-noise-slider')?.addEventListener('input', async (e) => {
      const val = parseFloat(e.target.value);
      const lbl = this.container.querySelector('#ns-noise-label');
      if (lbl) lbl.textContent = `${val.toFixed(2)} σ`;
      await this.service.runTimeReversal(this.service.blockedPaths, val);
      this.renderEarwormAndTimeReversal(this.service.lastSweep?.earworm || this.service.computeSyntheticEarworm());
    });
    this.container.querySelector('#ns-gw-thresh')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const lbl = this.container.querySelector('#ns-gw-thresh-lbl');
      if (lbl) lbl.textContent = `${val} dB`;
      this.service.computeGlowWormBurst(val, this.service.glowWormGainDb);
      this.renderEarwormAndTimeReversal(this.service.computeSyntheticEarworm());
    });
    this.container.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this.runAnalysis(btn.getAttribute('data-mode')));
    });
    const sendBtn = this.container.querySelector('#ns-chat-send');
    const chatInput = this.container.querySelector('#ns-chat-input');
    sendBtn?.addEventListener('click', () => this.sendChat());
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChat();
    });
  }

  async refreshModels() {
    const info = await this.service.fetchModels();
    const badge = this.container.querySelector('#ns-ollama-badge');
    const select = this.container.querySelector('#ns-model-select');
    if (badge) {
      badge.textContent = info.online ? `OLLAMA ONLINE (${info.models.length} models)` : 'OLLAMA OFFLINE (Fallback Ready)';
      badge.className = `ns-badge ${info.online ? 'ok' : 'warn'}`;
    }
    if (select) {
      select.innerHTML = '';
      info.models.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.specialist ? `★ ${m.name}` : m.name;
        if (m.name === this.service.selectedModel) opt.selected = true;
        select.appendChild(opt);
      });
    }
  }

  async triggerSweep() {
    const data = await this.service.runSweep();
    const prov = this.container.querySelector('#ns-prov-badge');
    if (prov) {
      prov.textContent = `${data.provenance} (${data.source})`;
      prov.className = `ns-badge ${data.provenance === 'MEASURED' ? 'ok' : 'warn'}`;
    }

    const kpis = this.container.querySelector('#ns-kpis');
    if (kpis) {
      kpis.innerHTML = `
        <div class="ns-kpi"><span>Visible BSSIDs</span><strong>${data.rf_sweep.bssid_count}</strong></div>
        <div class="ns-kpi"><span>Cleanest Channels</span><strong>2.4G: Ch ${data.rf_sweep.recommended_channels.band_2_4ghz} | 5G: Ch ${data.rf_sweep.recommended_channels.band_5ghz}</strong></div>
        <div class="ns-kpi"><span>Active CSI Nodes</span><strong>${data.csi_mesh.active_nodes} (${data.csi_mesh.motion_level})</strong></div>
        <div class="ns-kpi"><span>Rogue AP / Re-ID Risk</span><strong>${data.privacy_audit.rogue_ap_alerts} alert | ${data.privacy_audit.reid_risk_pct}%</strong></div>
      `;
    }

    const bssidWrap = this.container.querySelector('#ns-bssid-list');
    if (bssidWrap) {
      const rows = data.rf_sweep.bssids.map((b) => `
        <tr>
          <td><code>${b.bssid}</code></td>
          <td>${b.ssid || '<em>(hidden)</em>'}</td>
          <td>Ch ${b.channel} (${b.band})</td>
          <td>${b.radio}</td>
          <td>${b.rssi_dbm} dBm</td>
          <td>${b.variance} dB²</td>
          <td><span class="ns-tag ${b.status.includes('anomaly') ? 'danger' : 'normal'}">${b.status}</span></td>
        </tr>
      `).join('');
      bssidWrap.innerHTML = `<table class="ns-table"><thead><tr><th>BSSID</th><th>SSID</th><th>Channel</th><th>Radio</th><th>RSSI</th><th>Var</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    const meshWrap = this.container.querySelector('#ns-mesh-audit');
    if (meshWrap) {
      const nodesHtml = data.csi_mesh.nodes.map((n) =>
        `<div class="ns-node-row">Node #${n.node_id} · RSSI ${n.rssi_dbm} dBm · Coherence ${n.coherence} · Motion: <strong>${n.motion_level}</strong></div>`
      ).join('');
      meshWrap.innerHTML = `
        <div class="ns-section-sub"><strong>mDNS Discovery:</strong> <code>${data.csi_mesh.discovery_service}</code> · Persons: ${data.csi_mesh.person_count}</div>
        ${nodesHtml}
        <div class="ns-audit-box">
          <strong>Passive RF &amp; Privacy Audit:</strong> Beamforming Exposure: <code>${data.privacy_audit.beamforming_exposure}</code> (${data.privacy_audit.reid_risk_pct}% re-ID risk)<br/>
          <span>${data.privacy_audit.recommendation}</span>
        </div>
      `;
    }

    const ew = data.earworm || this.service.computeSyntheticEarworm();
    this.sonifier.update(ew);
    this.renderEarwormAndTimeReversal(ew);
  }

  renderEarwormAndTimeReversal(ew) {
    if (!ew) return;
    const tdoa = ew.tdoa || {};
    const bf = ew.beamforming || {};
    const mp = ew.spatial_multipath || {};
    const tr = this.service.lastTimeReversal || ew.time_reversal || this.service.computeTimeReversal();

    const tdoaSum = this.container.querySelector('#ns-tdoa-summary');
    if (tdoaSum) {
      tdoaSum.innerHTML = `<strong>Target XYZ:</strong> <code>[${(tdoa.estimated_target_xyz || [0,0,0]).join(', ')}] m</code> · <strong>GDOP:</strong> ${tdoa.gdop} · <strong>802.11bf:</strong> AoA ${bf.aoa_deg}° / AoD ${bf.aod_deg}° (${bf.main_lobe_gain_dbi} dBi)`;
    }
    drawPolarBeamformingCanvas(this.container.querySelector('#ns-polar-canvas'), bf);

    const tdoaTbl = this.container.querySelector('#ns-tdoa-table');
    if (tdoaTbl && Array.isArray(tdoa.pairs)) {
      const rows = tdoa.pairs.map((p) => `<tr><td><code>${p.pair_id}</code></td><td>${p.delta_tau_ns} ns</td><td>${p.range_diff_m} m</td><td>${p.cross_corr_peak}</td><td>${p.snr_db} dB</td></tr>`).join('');
      tdoaTbl.innerHTML = `<table class="ns-table"><thead><tr><th>Anchor Pair</th><th>Δτ</th><th>Δd</th><th>XCorr</th><th>SNR</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    const mpSum = this.container.querySelector('#ns-multipath-summary');
    if (mpSum) {
      mpSum.innerHTML = `<strong>Rician K:</strong> ${mp.rician_k_factor_db} dB · <strong>RMS Delay Spread τ_rms:</strong> ${mp.rms_delay_spread_ns} ns · <strong>Coherence BW:</strong> ${mp.coherence_bandwidth_mhz} MHz`;
    }
    const mpTbl = this.container.querySelector('#ns-multipath-table');
    if (mpTbl && Array.isArray(mp.paths)) {
      const rows = mp.paths.map((p) => `<tr><td>${p.kind}</td><td>${p.delay_ns} ns</td><td>${p.path_length_m} m</td><td>${p.attenuation_db} dB</td><td>${p.doppler_hz} Hz</td></tr>`).join('');
      mpTbl.innerHTML = `<table class="ns-table"><thead><tr><th>Ray Cluster</th><th>Delay</th><th>Length</th><th>Gain</th><th>Doppler</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    const plutoBox = this.container.querySelector('#ns-pluto-status');
    const p = this.service.plutoConfig;
    if (plutoBox) {
      plutoBox.innerHTML = `<strong>Mode:</strong> <code>${this.service.executionMode.toUpperCase()}</code> · <strong>SDR:</strong> <code>${p.device_name} (${p.uri} @ ${p.center_freq_mhz} MHz)</code> · <strong>Peak/RMS Focus:</strong> ${tr.peak_to_rms_ratio}x<br/><span>${p.diagnostic}</span>`;
    }

    const maskRow = this.container.querySelector('#ns-tr-mask-row');
    if (maskRow) {
      maskRow.innerHTML = '';
      (tr.path_delays || [0, 71, 112, 34, 126, 91]).forEach((delay, idx) => {
        const blocked = (tr.blocked_paths || []).includes(idx);
        const btn = document.createElement('button');
        btn.className = `ns-btn ${blocked ? '' : 'primary'}`;
        btn.textContent = `Path ${idx} (${delay} samp): ${blocked ? '180° BLOCKED' : 'ACTIVE'}`;
        btn.addEventListener('click', async () => {
          const set = new Set(this.service.blockedPaths);
          if (set.has(idx)) set.delete(idx);
          else set.add(idx);
          await this.service.runTimeReversal([...set], this.service.noiseAmplitude);
          this.renderEarwormAndTimeReversal(ew);
        });
        maskRow.appendChild(btn);
      });
    }

    drawTimeReversalAuditCanvas(this.container.querySelector('#ns-tr-canvas'), tr);

    const gw = ew.glowworm_burst || this.service.computeGlowWormBurst();
    const gwStatus = this.container.querySelector('#ns-gw-status');
    if (gwStatus && gw) {
      gwStatus.innerHTML = `<strong>Status:</strong> <code>${gw.status_message}</code> · <strong>Max Power:</strong> ${gw.max_power_db} dB (Threshold ${gw.threshold_db} dB) · <strong>3D Emitter:</strong> <code>[${(gw.emitter_3d_xyz || []).join(', ')}] m</code>`;
    }
    drawGlowWormBurstCanvas(this.container.querySelector('#ns-gw-canvas'), gw);
  }

  async runAnalysis(mode) {
    const out = this.container.querySelector('#ns-analysis-output');
    if (out) out.textContent = `Running ${mode} with ${this.service.selectedModel}...`;
    const res = await this.service.analyzeSweep(mode, this.service.selectedModel);
    if (out) {
      out.textContent = `[${res.provenance} · ${res.model} · ${res.latency_ms}ms]\n\n${res.analysis}`;
    }
  }

  async sendChat() {
    const input = this.container.querySelector('#ns-chat-input');
    const log = this.container.querySelector('#ns-chat-log');
    const prompt = input?.value?.trim();
    if (!prompt || !log) return;
    input.value = '';

    const userBubble = document.createElement('div');
    userBubble.className = 'ns-msg user';
    userBubble.textContent = `You: ${prompt}`;
    log.appendChild(userBubble);

    const botBubble = document.createElement('div');
    botBubble.className = 'ns-msg bot';
    botBubble.textContent = `Querying ${this.service.selectedModel}...`;
    log.appendChild(botBubble);

    const res = await this.service.chat(prompt, this.service.selectedModel);
    botBubble.textContent = `[${res.model} · ${res.provenance} · ${res.latency_ms}ms]\n${res.reply}`;
    log.scrollTop = log.scrollHeight;
  }
}
