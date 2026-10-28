// RuView Earworm 3D Room Engine: TDoA, 802.11bf Beamforming, Spatial Multipath,
// EnhancedTimeReversalSimulator (180° CIR Phase Cancellation), ADALM-Pluto SDR & Ollama SignalIntelligence.

export function drawPolarBeamformingCanvas(canvas, beamforming) {
  if (!canvas || !beamforming || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width || 220;
  const h = canvas.height || 140;
  const cx = w * 0.5;
  const cy = h - 16;
  const radius = Math.min(w * 0.44, h - 26);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#162840';
  ctx.lineWidth = 1;
  [0.33, 0.66, 1.0].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * r, Math.PI, 0, false);
    ctx.stroke();
  });

  for (let deg = -90; deg <= 90; deg += 30) {
    const rad = ((deg - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius);
    ctx.stroke();
  }

  const bins = Array.isArray(beamforming.polar_spectrum) ? beamforming.polar_spectrum : [];
  if (bins.length > 0) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    bins.forEach((b) => {
      const rad = ((b.angle_deg - 90) * Math.PI) / 180;
      const r = radius * Math.max(0.08, Math.min(1.0, b.gain_norm));
      ctx.lineTo(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 255, 204, 0.24)';
    ctx.fill();
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  const aoaRad = (((beamforming.aoa_deg || 0) - 90) * Math.PI) / 180;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(aoaRad) * radius, cy + Math.sin(aoaRad) * radius);
  ctx.strokeStyle = '#ffaa00';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#aaddff';
  ctx.font = '10px monospace';
  ctx.fillText(`AoA ${beamforming.aoa_deg ?? 0}° | AoD ${beamforming.aod_deg ?? 0}°`, 8, 13);
}

export function drawTimeReversalAuditCanvas(canvas, tr) {
  if (!canvas || !tr || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width || 320;
  const h = canvas.height || 180;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, w, h);

  const traces = [
    { data: tr.original_pulse || [], color: '#00ffcc', label: '1. Original Clean Source Pulse' },
    { data: tr.scrambled_baseline || [], color: '#ff4d4f', label: '2. Raw Multipath Room Signature' },
    {
      data: tr.focused_result || [],
      color: (tr.noise_amplitude || 0) > 0.1 ? '#faad14' : '#52c41a',
      label: `3. Time-Reversed Focus (σ=${tr.noise_amplitude ?? 0.12} | Null:[${(tr.blocked_paths || []).join(',')}])`,
    },
  ];

  const rowH = h / 3;
  traces.forEach((t, idx) => {
    const y0 = idx * rowH;
    const midY = y0 + rowH * 0.56;
    ctx.strokeStyle = '#151522';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    const arr = t.data;
    if (arr.length > 1) {
      let maxAbs = 0.001;
      for (let i = 0; i < arr.length; i++) {
        const a = Math.abs(arr[i]);
        if (a > maxAbs) maxAbs = a;
      }
      ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = (i / (arr.length - 1)) * (w - 12) + 6;
        const y = midY - (arr[i] / maxAbs) * (rowH * 0.36);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    ctx.fillStyle = '#d8e6ff';
    ctx.font = '10px monospace';
    ctx.fillText(t.label, 6, y0 + 12);
  });
}

export class EarwormAudioSonifier {
  constructor() {
    this.ctx = null;
    this.isMuted = true;
    this.micActive = false;
    this.oscLeft = null;
    this.oscRight = null;
    this.panner = null;
    this.masterGain = null;
    this.micAnalyser = null;
    this.micLevel = 0;
  }

  toggleAudio() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.08;
        this.panner = this.ctx.createPanner();
        this.panner.panningModel = 'HRTF';
        this.oscLeft = this.ctx.createOscillator();
        this.oscRight = this.ctx.createOscillator();
        this.oscLeft.type = 'sine';
        this.oscRight.type = 'triangle';
        this.oscLeft.frequency.value = 220;
        this.oscRight.frequency.value = 226;
        this.oscLeft.connect(this.panner);
        this.oscRight.connect(this.panner);
        this.panner.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.oscLeft.start();
        this.oscRight.start();
      }
    }
    this.isMuted = !this.isMuted;
    if (this.ctx && this.masterGain) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0.0 : 0.08, this.ctx.currentTime, 0.05);
    }
    return !this.isMuted;
  }

  async toggleMic() {
    if (this.micActive) {
      this.micActive = false;
      return false;
    }
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!this.ctx) this.toggleAudio();
        const src = this.ctx.createMediaStreamSource(stream);
        this.micAnalyser = this.ctx.createAnalyser();
        this.micAnalyser.fftSize = 256;
        src.connect(this.micAnalyser);
        this.micActive = true;
      } catch {
        this.micActive = false;
      }
    }
    return this.micActive;
  }

  update(earworm) {
    if (this.micActive && this.micAnalyser) {
      const buf = new Uint8Array(this.micAnalyser.frequencyBinCount);
      this.micAnalyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += Math.abs(buf[i] - 128);
      this.micLevel = Math.round((sum / buf.length) * 100) / 100;
    }
    if (!this.ctx || this.isMuted || !earworm?.sonification) return;
    const s = earworm.sonification;
    const now = this.ctx.currentTime;
    const f0 = s.carrier_freq_hz || 220;
    const beat = s.binaural_beat_hz || 6;
    this.oscLeft.frequency.setTargetAtTime(f0, now, 0.06);
    this.oscRight.frequency.setTargetAtTime(f0 + beat, now, 0.06);
    const [x, y, z] = s.spatial_pan_xyz || [0, 1.2, 0];
    if (this.panner.positionX) {
      this.panner.positionX.setTargetAtTime(x, now, 0.06);
      this.panner.positionY.setTargetAtTime(y, now, 0.06);
      this.panner.positionZ.setTargetAtTime(z, now, 0.06);
    }
  }

  dispose() {
    if (this.ctx) this.ctx.close().catch(() => {});
  }
}

export class EarwormSceneLayer {
  constructor(threeScene) {
    this.scene = threeScene;
    this.THREE = typeof window !== 'undefined' ? window.THREE : null;
    this.root = null;
    this.tdoaGroup = null;
    this.beamGroup = null;
    this.multipathGroup = null;
    this.txCone = null;
    this.rxCone = null;
    this.targetReticle = null;
    this.targetRing = null;
    this.rayLines = [];
    this.bounceSpheres = [];
    this.pulseBeads = [];
    this.showTdoa = true;
    this.showBeamforming = true;
    this.showMultipath = true;
    if (this.THREE && this.scene) this._init3D();
  }

  _init3D() {
    const THREE = this.THREE;
    this.root = new THREE.Group();
    this.root.name = 'Earworm3DRoomLayer';

    this.tdoaGroup = new THREE.Group();
    this.beamGroup = new THREE.Group();
    this.multipathGroup = new THREE.Group();
    this.root.add(this.tdoaGroup);
    this.root.add(this.beamGroup);
    this.root.add(this.multipathGroup);

    // 1. TDoA Hyperbolic Target Lock Reticle on floor + vertical beacon
    const ringGeo = new THREE.RingGeometry(0.32, 0.44, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
    });
    this.targetReticle = new THREE.Mesh(ringGeo, ringMat);
    this.targetReticle.position.set(0, 0.03, 0);
    this.tdoaGroup.add(this.targetReticle);

    const outerGeo = new THREE.RingGeometry(0.62, 0.68, 32);
    outerGeo.rotateX(-Math.PI / 2);
    this.targetRing = new THREE.Mesh(
      outerGeo,
      new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    this.targetRing.position.set(0, 0.025, 0);
    this.tdoaGroup.add(this.targetRing);

    // 2. 802.11bf ULA Beamforming Cones from TX2 [0,2.5,-2.8] & RX2 [0,2.5,2.8]
    const coneGeo = new THREE.ConeGeometry(0.95, 3.6, 20, 1, true);
    coneGeo.translate(0, -1.8, 0);
    coneGeo.rotateX(Math.PI / 2);
    this.txCone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({ color: 0x00ccff, wireframe: true, transparent: true, opacity: 0.35 })
    );
    this.txCone.position.set(0, 2.5, -2.8);
    this.beamGroup.add(this.txCone);

    this.rxCone = new THREE.Mesh(
      coneGeo.clone(),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.35 })
    );
    this.rxCone.position.set(0, 2.5, 2.8);
    this.beamGroup.add(this.rxCone);

    // 3. 6 Spatial Multipath + Time-Reversal Mirror Rays (Path 0 .. Path 5)
    for (let i = 0; i < 6; i++) {
      const pts = [new THREE.Vector3(0, 2.5, -2.8), new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 2.5, 2.8)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.85 });
      const line = new THREE.Line(geo, mat);
      this.multipathGroup.add(line);
      this.rayLines.push({ line, pts });

      const sp = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x00ffcc })
      );
      this.multipathGroup.add(sp);
      this.bounceSpheres.push(sp);

      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      this.multipathGroup.add(bead);
      this.pulseBeads.push(bead);
    }

    this.scene.add(this.root);
  }

  setVisibility({ tdoa, beamforming, multipath }) {
    if (typeof tdoa === 'boolean') this.showTdoa = tdoa;
    if (typeof beamforming === 'boolean') this.showBeamforming = beamforming;
    if (typeof multipath === 'boolean') this.showMultipath = multipath;
    if (this.tdoaGroup) this.tdoaGroup.visible = this.showTdoa;
    if (this.beamGroup) this.beamGroup.visible = this.showBeamforming;
    if (this.multipathGroup) this.multipathGroup.visible = this.showMultipath;
  }

  update(earworm, elapsed = 0) {
    if (!this.THREE || !this.root || !earworm) return;
    const THREE = this.THREE;
    const target = earworm.tdoa?.estimated_target_xyz || [0, 1.25, 0];
    const [tx, ty, tz] = target;

    if (this.targetReticle && this.targetRing) {
      this.targetReticle.position.set(tx, 0.03, tz);
      this.targetRing.position.set(tx, 0.025, tz);
      const s = 1 + 0.18 * Math.sin(elapsed * 4.5);
      this.targetRing.scale.set(s, s, 1);
    }

    if (this.txCone && this.rxCone) {
      this.txCone.lookAt(tx, ty, tz);
      this.rxCone.lookAt(tx, ty, tz);
    }

    // 6 reflection channels synchronized with EnhancedTimeReversalSimulator (Path 0..5)
    const mask = earworm.time_reversal?.path_override_mask || [1, 1, 0, 1, 0, 1];
    const roomPaths = [
      { o: [0, 2.5, -2.8], b: [0, 2.5, 0], r: [0, 2.5, 2.8] }, // Path 0: LoS Direct
      { o: [-3.5, 2.5, -2.8], b: [tx * 0.4, 1.8, -2.95], r: [0, 2.5, 2.8] }, // Path 1: North Wall
      { o: [-3.5, 2.5, -2.8], b: [-3.95, 1.6, tz * 0.5], r: [-3.5, 2.5, 2.8] }, // Path 2: West Wall
      { o: [0, 2.5, -2.8], b: [tx, ty, tz], r: [0, 2.5, 2.8] }, // Path 3: Body/Floor Scatter
      { o: [3.5, 2.5, -2.8], b: [3.95, 1.6, tz * 0.5], r: [3.5, 2.5, 2.8] }, // Path 4: East Wall
      { o: [0, 2.5, -2.8], b: [tx * 0.5, 2.95, tz * 0.4], r: [0, 2.5, 2.8] }, // Path 5: Ceiling Diffraction
    ];

    for (let i = 0; i < 6; i++) {
      const cfg = roomPaths[i];
      const active = (mask[i] ?? 1) > 0;
      const entry = this.rayLines[i];
      const sp = this.bounceSpheres[i];
      const bead = this.pulseBeads[i];
      if (!entry) continue;

      const vO = new THREE.Vector3(...cfg.o);
      const vB = new THREE.Vector3(...cfg.b);
      const vR = new THREE.Vector3(...cfg.r);
      entry.line.geometry.setFromPoints([vO, vB, vR]);

      // Active Time-Reversal paths glow emerald/cyan; 180° phase-nulled wall paths glow crimson
      const colorHex = active ? (i === 0 ? 0x00ffcc : 0x52c41a) : 0xff4d4f;
      entry.line.material.color.setHex(colorHex);
      entry.line.material.opacity = active ? 0.88 : 0.42;

      sp.position.copy(vB);
      sp.material.color.setHex(colorHex);
      sp.scale.setScalar(active ? 1.0 : 1.45);

      // Animate time-reversed wave packet converging along active paths
      bead.visible = active;
      if (active) {
        const u = ((elapsed * 0.85 + i * 0.17) % 1 + 1) % 1;
        // Time-Reversal retraces RX -> Bounce -> TX/Target
        if (u < 0.5) {
          bead.position.lerpVectors(vR, vB, u * 2);
        } else {
          bead.position.lerpVectors(vB, vO, (u - 0.5) * 2);
        }
      }
    }
  }

  dispose() {
    if (this.root && this.scene) this.scene.remove(this.root);
  }
}

export class EarwormHudDock {
  constructor(container, { service, sceneLayer, sonifier, onModeChange } = {}) {
    this.container = container;
    this.service = service;
    this.sceneLayer = sceneLayer;
    this.sonifier = sonifier;
    this.onModeChange = onModeChange;
    this.el = null;
    this.polarCanvas = null;
    this.trCanvas = null;
    if (this.container && typeof document !== 'undefined') this._mount();
  }

  _mount() {
    this.el = document.createElement('div');
    this.el.id = 'earworm-hud-dock';
    this.el.style.cssText = [
      'position:absolute;left:14px;bottom:14px;width:360px;max-height:88vh;overflow-y:auto;',
      'background:rgba(6,10,20,0.92);border:1px solid #1d3b58;border-radius:8px;padding:10px;',
      'font-family:monospace;font-size:11px;color:#bde0ff;z-index:350;box-shadow:0 6px 24px rgba(0,0,0,0.65);',
    ].join('');

    this.el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:1px solid #16304a;padding-bottom:5px;">
        <strong style="color:#00ffcc;font-size:12px;">EARWORM 3D + TIME-REVERSAL + PLUTO SDR</strong>
        <span id="ew-mode-badge" style="background:#143828;color:#52c41a;padding:2px 6px;border-radius:4px;font-size:10px;">DEMO [SYNTHETIC]</span>
      </div>

      <div style="display:flex;gap:4px;margin-bottom:6px;">
        <button id="ew-btn-demo" style="flex:1;background:#0d3b4e;color:#00ffcc;border:1px solid #00ffcc;padding:4px;border-radius:4px;cursor:pointer;font-size:10px;">DEMO MODE</button>
        <button id="ew-btn-real" style="flex:1;background:#101c2c;color:#8ab4d8;border:1px solid #264666;padding:4px;border-radius:4px;cursor:pointer;font-size:10px;">FULL REAL (PlutoSDR)</button>
      </div>

      <div id="ew-pluto-bar" style="background:#081220;border:1px solid #1a324d;padding:5px;border-radius:4px;margin-bottom:6px;font-size:10px;">
        <div style="display:flex;gap:4px;align-items:center;margin-bottom:3px;">
          <span>URI:</span>
          <input id="ew-pluto-uri" value="ip:192.168.2.1" style="flex:1;background:#040810;color:#00ffcc;border:1px solid #224466;padding:2px 4px;font-size:10px;" />
          <select id="ew-pluto-freq" style="background:#040810;color:#00ffcc;border:1px solid #224466;padding:2px;font-size:10px;">
            <option value="2412">2412 MHz (Ch1)</option>
            <option value="2437" selected>2437 MHz (Ch6)</option>
            <option value="2462">2462 MHz (Ch11)</option>
            <option value="5180">5180 MHz (Ch36)</option>
            <option value="5745">5745 MHz (Ch149)</option>
          </select>
        </div>
        <div id="ew-pluto-diag" style="color:#7799bb;">ADALM-Pluto SDR (AD9363): Ready for Demo or libiio Real capture</div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">
        <button id="ew-tog-audio" style="background:#122438;color:#aaddff;border:1px solid #264b70;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:10px;">🔇 Audio [E]</button>
        <button id="ew-tog-mic" style="background:#122438;color:#aaddff;border:1px solid #264b70;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:10px;">🎙️ Mic TDoA</button>
        <button id="ew-tog-mp" style="background:#0e382e;color:#00ffcc;border:1px solid #00ffcc;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:10px;">📡 Multipath [M]</button>
        <button id="ew-tog-bf" style="background:#0e382e;color:#00ffcc;border:1px solid #00ffcc;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:10px;">🎯 Beam [B]</button>
        <button id="ew-tog-tdoa" style="background:#0e382e;color:#00ffcc;border:1px solid #00ffcc;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:10px;">〰️ TDoA [T]</button>
      </div>

      <div id="ew-metrics" style="background:#070e1a;padding:5px;border-radius:4px;margin-bottom:6px;line-height:1.45;"></div>

      <div style="margin-bottom:4px;font-size:10px;color:#99ccff;">
        <strong>180° CIR Phase-Cancellation Wall Mask</strong> (click path to block/unblock):
      </div>
      <div id="ew-mask-btns" style="display:flex;gap:3px;margin-bottom:5px;"></div>

      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:10px;">
        <span>Noise Floor σ:</span>
        <input id="ew-noise-slider" type="range" min="0" max="0.30" step="0.01" value="0.12" style="flex:1;" />
        <span id="ew-noise-val" style="color:#faad14;">0.12 σ</span>
      </div>

      <canvas id="ew-tr-canvas" width="336" height="162" style="width:100%;border:1px solid #1a3048;border-radius:4px;margin-bottom:6px;"></canvas>
      <canvas id="ew-polar-canvas" width="336" height="118" style="width:100%;border:1px solid #1a3048;border-radius:4px;margin-bottom:6px;"></canvas>

      <div style="border-top:1px solid #16304a;padding-top:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <strong style="color:#ffaa00;font-size:10px;">OLLAMA SIGNALINTELLIGENCE ADVISOR</strong>
          <button id="ew-ask-ollama" style="background:#2b1f08;color:#ffaa00;border:1px solid #ffaa00;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px;">Ask SignalIntelligence</button>
        </div>
        <div id="ew-ollama-out" style="background:#050811;border:1px solid #1a2c42;padding:5px;border-radius:4px;font-size:10px;color:#cde4ff;white-space:pre-wrap;max-height:110px;overflow-y:auto;">Click "Ask SignalIntelligence" to query nightsweep-signalintelligence:latest for PlutoSDR & 3D Time-Reversal guidance.</div>
      </div>
    `;

    this.container.appendChild(this.el);
    this.trCanvas = this.el.querySelector('#ew-tr-canvas');
    this.polarCanvas = this.el.querySelector('#ew-polar-canvas');
    this._bindEvents();
    this._renderMaskButtons();
  }

  _renderMaskButtons() {
    const wrap = this.el?.querySelector('#ew-mask-btns');
    if (!wrap || !this.service) return;
    wrap.innerHTML = '';
    const names = ['P0:LoS', 'P1:N-Wall', 'P2:W-Wall', 'P3:Body', 'P4:E-Wall', 'P5:Ceil'];
    for (let i = 0; i < 6; i++) {
      const blocked = this.service.blockedPaths.includes(i);
      const btn = document.createElement('button');
      btn.textContent = names[i];
      btn.style.cssText = `flex:1;padding:3px 2px;font-size:9px;border-radius:3px;cursor:pointer;border:1px solid ${
        blocked ? '#ff4d4f' : '#52c41a'
      };background:${blocked ? '#331114' : '#0f2e1e'};color:${blocked ? '#ff8888' : '#77ffaa'};`;
      btn.title = blocked ? '180° Phase-Cancelled (BLOCKED)' : 'Active Multipath Channel';
      btn.addEventListener('click', async () => {
        const set = new Set(this.service.blockedPaths);
        if (set.has(i)) set.delete(i);
        else set.add(i);
        await this.service.runTimeReversal([...set], this.service.noiseAmplitude);
        this._renderMaskButtons();
      });
      wrap.appendChild(btn);
    }
  }

  _bindEvents() {
    const q = (sel) => this.el.querySelector(sel);
    q('#ew-btn-demo')?.addEventListener('click', () => this.switchMode('demo'));
    q('#ew-btn-real')?.addEventListener('click', () => this.switchMode('real'));

    q('#ew-tog-audio')?.addEventListener('click', () => {
      const on = this.sonifier?.toggleAudio();
      q('#ew-tog-audio').textContent = on ? '🔊 Audio [E]' : '🔇 Audio [E]';
    });
    q('#ew-tog-mic')?.addEventListener('click', async () => {
      const on = await this.sonifier?.toggleMic();
      q('#ew-tog-mic').textContent = on ? '🎙️ Mic ON' : '🎙️ Mic TDoA';
    });
    q('#ew-tog-mp')?.addEventListener('click', () => {
      const next = !this.sceneLayer?.showMultipath;
      this.sceneLayer?.setVisibility({ multipath: next });
    });
    q('#ew-tog-bf')?.addEventListener('click', () => {
      const next = !this.sceneLayer?.showBeamforming;
      this.sceneLayer?.setVisibility({ beamforming: next });
    });
    q('#ew-tog-tdoa')?.addEventListener('click', () => {
      const next = !this.sceneLayer?.showTdoa;
      this.sceneLayer?.setVisibility({ tdoa: next });
    });

    const slider = q('#ew-noise-slider');
    slider?.addEventListener('input', async (e) => {
      const val = parseFloat(e.target.value);
      q('#ew-noise-val').textContent = `${val.toFixed(2)} σ`;
      await this.service?.runTimeReversal(this.service.blockedPaths, val);
    });

    q('#ew-ask-ollama')?.addEventListener('click', () => this.askSignalIntelligence());
  }

  async switchMode(mode) {
    if (!this.service) return;
    const uri = this.el.querySelector('#ew-pluto-uri')?.value || 'ip:192.168.2.1';
    const freq = parseFloat(this.el.querySelector('#ew-pluto-freq')?.value || '2437');
    await this.service.setExecutionMode(mode, { uri, center_freq_mhz: freq });
    const badge = this.el.querySelector('#ew-mode-badge');
    const diag = this.el.querySelector('#ew-pluto-diag');
    const p = this.service.plutoConfig;
    if (badge) {
      badge.textContent = mode === 'real' ? (p.connected ? 'REAL [PLUTO MEASURED]' : 'REAL [CSI+PLUTO STANDBY]') : 'DEMO [SYNTHETIC]';
      badge.style.color = mode === 'real' ? '#00ffcc' : '#52c41a';
    }
    if (diag) diag.textContent = p.diagnostic;
    if (this.onModeChange) this.onModeChange(mode, p);
  }

  async askSignalIntelligence() {
    const out = this.el?.querySelector('#ew-ollama-out');
    if (!out || !this.service) return;
    out.textContent = 'Querying nightsweep-signalintelligence:latest...';
    const res = await this.service.analyzeSweep('pluto_time_reversal', 'nightsweep-signalintelligence:latest');
    out.textContent = `[${res.model} | ${res.provenance}]\n${res.analysis}`;
  }

  update(earworm) {
    if (!this.el || !earworm) return;
    const t = earworm.tdoa || {};
    const bf = earworm.beamforming || {};
    const mp = earworm.spatial_multipath || {};
    const tr = earworm.time_reversal || this.service?.lastTimeReversal;
    const xyz = (t.estimated_target_xyz || [0, 0, 0]).map((v) => Number(v).toFixed(2)).join(', ');

    const metrics = this.el.querySelector('#ew-metrics');
    if (metrics) {
      metrics.innerHTML = [
        `<div><span style="color:#7799bb;">TDoA Target:</span> <strong>[${xyz}] m</strong> | GDOP: <strong>${t.gdop ?? 1.3}</strong></div>`,
        `<div><span style="color:#7799bb;">802.11bf ULA:</span> AoA <strong>${bf.aoa_deg ?? 0}°</strong> | AoD <strong>${bf.aod_deg ?? 0}°</strong> | Gain <strong>${bf.main_lobe_gain_dbi ?? 11.8} dBi</strong></div>`,
        `<div><span style="color:#7799bb;">Multipath CIR:</span> τ_rms <strong>${mp.rms_delay_spread_ns ?? 8.5} ns</strong> | K <strong>${mp.rician_k_factor_db ?? 6.8} dB</strong> | TR Peak/RMS <strong>${tr?.peak_to_rms_ratio ?? 4.2}x</strong></div>`,
      ].join('');
    }

    drawPolarBeamformingCanvas(this.polarCanvas, bf);
    if (tr) drawTimeReversalAuditCanvas(this.trCanvas, tr);
  }
}
