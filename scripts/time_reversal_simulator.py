#!/usr/bin/env python3
"""
EnhancedTimeReversalSimulator — Virtual Multipath CIR Override & Time-Reversal Mirror
Integrated with RuView Earworm 3D Room Visualization & NetSweep Dashboard.
"""

import argparse
import json
import os
import numpy as np
import matplotlib
if not os.environ.get("DISPLAY") or os.environ.get("MPLBACKEND", "").lower() == "agg":
    matplotlib.use("Agg")
import matplotlib.pyplot as plt


class EnhancedTimeReversalSimulator:
    def __init__(self, num_reflections=5):
        """
        Initializes a virtual multipath environment with noise and cancellation options.
        """
        np.random.seed(42)
        self.num_paths = num_reflections

        # Room geometry initialization (Delays and Attenuations)
        self.path_delays = np.random.randint(20, 140, size=self.num_paths)
        self.path_gains = np.random.uniform(0.15, 0.5, size=self.num_paths)

        # Path 0 remains the primary direct line-of-sight path
        self.path_delays[0] = 0
        self.path_gains[0] = 1.0

        # Override Vector Mask: 1.0 means active, 0.0 means completely blocked/nulled
        self.path_override_mask = np.ones(self.num_paths)

    def set_path_override(self, path_index, block=True):
        """
        Simulates blocking or overriding a specific physical path (e.g., a wall reflection)
        using 180-degree destructive phase cancellation.
        """
        if 0 <= path_index < self.num_paths:
            self.path_override_mask[path_index] = 0.0 if block else 1.0
            status = "BLOCKED" if block else "ACTIVE"
            print(f"[CIR MASK] Path {path_index} (Delay: {self.path_delays[path_index]} samples) is now {status}.")

    def generate_source_pulse(self):
        t = np.arange(-30, 30)
        return np.sin(2 * np.pi * 0.1 * t) * np.exp(-t**2 / 200)

    def transmit_through_room(self, signal, inject_noise_level=0.0):
        """
        Passes the signal through the environment while applying the path mask and background noise.
        """
        total_len = len(signal) + np.max(self.path_delays)
        received_signal = np.zeros(total_len)

        # Accumulate only the unblocked paths through the matrix
        for i in range(self.num_paths):
            gain = self.path_gains[i] * self.path_override_mask[i]
            delay = self.path_delays[i]
            if gain > 0:
                received_signal[delay:delay + len(signal)] += signal * gain

        # Inject Dynamic Environmental Noise if requested
        if inject_noise_level > 0:
            noise = np.random.normal(0, inject_noise_level, size=total_len)
            received_signal += noise

        return received_signal

    def compute_audit_payload(self, noise_amplitude=0.05):
        # 1. Generate clean diagnostic pulse
        original_pulse = self.generate_source_pulse()

        # 2. Capture baseline channel profile (all paths active for baseline capture)
        saved_mask = self.path_override_mask.copy()
        self.path_override_mask = np.ones(self.num_paths)
        scrambled_baseline = self.transmit_through_room(original_pulse, inject_noise_level=0.0)
        self.path_override_mask = saved_mask

        # 3. Apply Time-Reversal to the baseline recording
        time_reversed_signal = np.flip(scrambled_baseline)

        # 4. Retransmit into the room under modified environmental conditions (Noise + Blocked Paths)
        focused_result = self.transmit_through_room(time_reversed_signal, inject_noise_level=noise_amplitude)

        blocked_paths = [int(i) for i in np.where(self.path_override_mask == 0.0)[0]]
        peak_val = float(np.max(np.abs(focused_result)))
        rms_val = float(np.sqrt(np.mean(focused_result**2))) + 1e-9

        return {
            "provenance": "SYNTHETIC",
            "num_paths": int(self.num_paths),
            "path_delays": [int(x) for x in self.path_delays],
            "path_gains": [round(float(x), 4) for x in self.path_gains],
            "path_override_mask": [float(x) for x in self.path_override_mask],
            "blocked_paths": blocked_paths,
            "noise_amplitude": float(noise_amplitude),
            "peak_to_rms_ratio": round(peak_val / rms_val, 3),
            "original_pulse": [round(float(x), 5) for x in original_pulse],
            "scrambled_baseline": [round(float(x), 5) for x in scrambled_baseline],
            "focused_result": [round(float(x), 5) for x in focused_result],
        }

    def run_auditing_demo(self, noise_amplitude=0.05, save_path=None):
        # 1. Generate clean diagnostic pulse
        original_pulse = self.generate_source_pulse()

        # 2. Capture baseline channel profile
        saved_mask = self.path_override_mask.copy()
        self.path_override_mask = np.ones(self.num_paths)
        scrambled_baseline = self.transmit_through_room(original_pulse, inject_noise_level=0.0)
        self.path_override_mask = saved_mask

        # 3. Apply Time-Reversal to the baseline recording
        time_reversed_signal = np.flip(scrambled_baseline)

        # 4. Retransmit into the room under modified environmental conditions (Noise + Blocked Paths)
        focused_result = self.transmit_through_room(time_reversed_signal, inject_noise_level=noise_amplitude)

        # Visual analysis
        self.plot_auditing_results(original_pulse, scrambled_baseline, focused_result, noise_amplitude, save_path=save_path)

    def plot_auditing_results(self, original, scrambled, focused, noise_lvl, save_path=None):
        fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(11, 8))
        fig.patch.set_facecolor('#0a0a0f')

        for ax in [ax1, ax2, ax3]:
            ax.set_facecolor('#050508')
            ax.tick_params(colors='#777788')
            ax.grid(True, color='#151522', linestyle=':')

        ax1.plot(original, color='#00ffcc', lw=1.5)
        ax1.set_title("1. Original Clean Source Pulse", color='#ffffff', fontsize=11)

        ax2.plot(scrambled, color='#ff4d4f', lw=1.2)
        ax2.set_title("2. Raw Multipath Room Signature (Unmodified Environment)", color='#ffffff', fontsize=11)

        # Display the convergent result highlighting degradation markers if present
        ax3.plot(focused, color='#faad14' if noise_lvl > 0.1 else '#52c41a', lw=1.5)
        blocked_paths = np.where(self.path_override_mask == 0.0)[0]
        title_suffix = f" (Noise Floor: {noise_lvl} σ | Nulled Wall Paths: {list(blocked_paths)})"
        ax3.set_title("3. Time-Reversed Output with Active Injections" + title_suffix, color='#ffffff', fontsize=11)

        plt.tight_layout()
        if save_path:
            plt.savefig(save_path, dpi=140, facecolor=fig.get_facecolor())
            print(f"[CIR AUDIT] Saved plot to {save_path}")
        elif os.environ.get("DISPLAY") and matplotlib.get_backend().lower() != "agg":
            plt.show()
        plt.close(fig)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enhanced Time-Reversal Multipath Simulator")
    parser.add_argument("--num-reflections", type=int, default=6)
    parser.add_argument("--block", type=int, nargs="*", default=[2, 4])
    parser.add_argument("--noise", type=float, default=0.12)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--save-plot", type=str, default=None)
    args = parser.parse_args()

    sim = EnhancedTimeReversalSimulator(num_reflections=args.num_reflections)
    for idx in args.block:
        sim.set_path_override(path_index=idx, block=True)

    if args.json:
        print(json.dumps(sim.compute_audit_payload(noise_amplitude=args.noise)))
    else:
        sim.run_auditing_demo(noise_amplitude=args.noise, save_path=args.save_plot)
