#!/usr/bin/env python3
"""Unit tests for EnhancedTimeReversalSimulator, PlutoSDR bridge, and URH 868.3 MHz Glow-worm detector."""

import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pluto_earworm_time_reversal import (  # noqa: E402
    EnhancedTimeReversalSimulator,
    PlutoGlowWormBurstDetector,
)


class TestPlutoEarwormTimeReversal(unittest.TestCase):
    def test_time_reversal_clean_vs_masked(self):
        sim = EnhancedTimeReversalSimulator(num_reflections=6)
        clean = sim.compute_audit_payload(noise_amplitude=0.0)
        self.assertEqual(clean["provenance"], "SYNTHETIC")
        self.assertEqual(clean["num_paths"], 6)
        self.assertEqual(clean["blocked_paths"], [])
        self.assertGreater(clean["peak_to_rms_ratio"], 2.5)

        sim.set_path_override(2, block=True)
        sim.set_path_override(4, block=True)
        masked = sim.compute_audit_payload(noise_amplitude=0.12)
        self.assertEqual(masked["blocked_paths"], [2, 4])
        self.assertEqual(masked["path_override_mask"][2], 0.0)
        self.assertEqual(masked["path_override_mask"][4], 0.0)

    def test_glowworm_868_burst_detector_and_10000_buffer_downsampling(self):
        det = PlutoGlowWormBurstDetector(uri="ip:192.168.2.1", rx_buffer_size=10000, threshold_db=-30.0)
        burst = det.capture_or_simulate_burst(mode="demo")
        self.assertEqual(burst["rx_lo_mhz"], 868.3)
        self.assertEqual(burst["rx_buffer_size"], 10000)
        self.assertEqual(len(burst["power_profile_db"]), 160)
        self.assertTrue(burst["signal_detected"])
        self.assertEqual(burst["demod_bits"], "101010101100101101001110")

        suppressed = PlutoGlowWormBurstDetector(uri="ip:192.168.2.1", threshold_db=-5.0).capture_or_simulate_burst(mode="demo")
        self.assertFalse(suppressed["signal_detected"])

    def test_cli_json_stdout_contract(self):
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pluto_earworm_time_reversal.py")
        raw = subprocess.check_output(
            [sys.executable, script, "--mode", "demo", "--block", "2", "4", "--noise", "0.12", "--json"],
            text=True,
        )
        parsed = json.loads(raw)
        self.assertEqual(parsed["blocked_paths"], [2, 4])
        self.assertTrue(parsed["glowworm_868_burst"]["signal_detected"])


if __name__ == "__main__":
    unittest.main()
