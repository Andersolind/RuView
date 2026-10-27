// NetSweep & Local Ollama AI Tab Component

import { netSweepOllamaService } from '../services/netsweep-ollama.service.js';

export class NetSweepTab {
  constructor(container) {
    this.container = container;
    this.service = netSweepOllamaService;
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
          <h3>3. One-Click Ollama Briefings &amp; Advisor</h3>
          <div class="ns-action-row">
            <button class="ns-btn" data-mode="briefing">Sweep Briefing</button>
            <button class="ns-btn" data-mode="anomaly_triage">Anomaly Triage</button>
            <button class="ns-btn" data-mode="placement_advisor">Placement &amp; Channel Advisor</button>
          </div>
          <pre id="ns-analysis-output" class="ns-output">Select an advisor mode above to run Ollama analysis on the live sweep.</pre>
        </div>

        <div class="ns-card">
          <h3>4. Interactive Ollama RF &amp; Network Copilot</h3>
          <div id="ns-chat-log" class="ns-chat-log"></div>
          <div class="ns-chat-input-row">
            <input id="ns-chat-input" class="ns-input" type="text" placeholder="Ask about rogue APs, channel congestion, or ESP32 node placement..." />
            <button id="ns-chat-send" class="ns-btn primary">Ask Ollama</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this.container.querySelector('#ns-scan-btn')?.addEventListener('click', () => this.triggerSweep());
    this.container.querySelector('#ns-model-select')?.addEventListener('change', (e) => {
      this.service.selectedModel = e.target.value;
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
