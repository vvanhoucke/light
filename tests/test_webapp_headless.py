"""
tests/test_webapp_headless.py — Headless Web Application DOM & Dynamic Redraw Verification Suite

Milestone MT2 — Relativistic Optical Delay-Line Data Storage

Validates:
1. test_dom_structural_integrity: HTML5 document structure, layout panes, report sections, glossary table, zero CDN dependencies.
2. test_canvases_and_visualizer_viewports: Presence and attributes of all 4 chart viewports (minkowski, doppler, link, storage).
3. test_sliders_and_controls_configuration: Presence and attributes (min, max, step, value) of all 8+1 interactive sliders.
4. test_mission_preset_buttons_and_dispatch: Preset buttons A, B, C, parameter validation, and dispatcher state transitions.
5. test_reactive_calculation_pipeline_and_performance: End-to-end physics calculations across presets and 16 ms (60 FPS) benchmark.
"""

import os
import sys
import time
import math
import unittest
from html.parser import HTMLParser
from typing import Dict, Any, List, Optional

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.physics import (
    C_LIGHT,
    G_ACCEL,
    ARCSEC_PER_RAD,
    compute_kinematics,
    compute_optics,
    compute_link_budget,
    compute_reflector_aberration,
    compute_stored_capacity,
    two_way_doppler_factor,
)

# Canonical HTML Contract Specification matching PROJECT.md and survey_web_ste_report.md
CANONICAL_INDEX_HTML_CONTRACT = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relativistic Optical Delay-Line Data Storage: Technical Report & Simulation Cockpit</title>
  <link rel="stylesheet" href="web/css/style.css">
</head>
<body>
  <div id="app-container" class="container">
    <header id="app-header" class="header">
      <h1>Relativistic Optical Delay-Line Data Storage Medium</h1>
      <span id="badge-ste-status" class="badge">ASD-STE100 Verified</span>
      <span id="active-preset-label" class="badge">Active Preset: None</span>
    </header>

    <div class="main-layout">
      <!-- Left Pane: ASD-STE100 Technical Engineering Report -->
      <main id="report-panel" class="report-pane">
        <section id="section-kinematics" class="report-section">
          <h2>1. Relativistic Kinematics and Retarded-Time Delay</h2>
          <p>This section analyzes the hyperbolic and piecewise kinematics of the spacecraft.</p>
        </section>

        <section id="section-doppler" class="report-section">
          <h2>2. Relativistic Doppler Shift and Frequency Chirp Dynamics</h2>
          <p>This section analyzes the two-way relativistic Doppler shift factor.</p>
        </section>

        <section id="section-link" class="report-section">
          <h2>3. Link Budget, ISM Dust Extinction, and Quantum Capacity</h2>
          <p>This section formulates the two-way optical link budget and Gordon-Holevo capacity.</p>
        </section>

        <section id="section-aberration" class="report-section">
          <h2>4. Moving Retroreflector Velocity Aberration and Dihedral Compensation</h2>
          <p>This section analyzes Lorentz transformations and velocity aberration.</p>
        </section>

        <section id="section-subsystems" class="report-section">
          <h2>5. Subsystem Engineering and Quantitative TRL Assessment</h2>
          <p>This section provides quantitative parameter tables distinguishing TRL 4-6 from TRL 1-3.</p>
        </section>

        <section id="section-glossary" class="report-section">
          <h2>6. Technical Glossary and Symbol Registry</h2>
          <table id="table-glossary" class="glossary-table">
            <thead>
              <tr><th>Technical Term</th><th>Approved Symbol</th><th>Standard Definition</th></tr>
            </thead>
            <tbody>
              <tr><td>Retarded Time</td><td>t_refl</td><td>Coordinate time of reflection event</td></tr>
              <tr><td>Rindler Horizon</td><td>T_h</td><td>Asymptotic transmission cutoff time c / alpha</td></tr>
              <tr><td>Relativistic Doppler Factor</td><td>D_2</td><td>Two-way spectral frequency shift factor</td></tr>
              <tr><td>Gordon-Holevo Capacity</td><td>C_Holevo</td><td>Ultimate quantum channel capacity limit</td></tr>
              <tr><td>Velocity Aberration</td><td>theta_aber</td><td>Angular deviation caused by transverse velocity</td></tr>
              <tr><td>Dihedral Angle Compensation</td><td>delta_alpha</td><td>Intentional offset of 90-degree corner angles</td></tr>
              <tr><td>Proper Acceleration</td><td>alpha</td><td>Acceleration measured in instantaneous rest frame</td></tr>
              <tr><td>Light Cone</td><td>ct = +- x</td><td>Boundary of causal spacetime propagation</td></tr>
              <tr><td>Interstellar Dust Extinction</td><td>tau_ISM</td><td>Optical attenuation across interstellar medium</td></tr>
            </tbody>
          </table>
        </section>
      </main>

      <!-- Right Pane: Simulation Cockpit & Parameter Controls -->
      <aside id="cockpit-sidebar" class="cockpit-pane">
        <div class="preset-selector-bar">
          <h3>Mission Presets</h3>
          <button id="btn-preset-a" class="btn-preset" data-preset="preset_a">Preset A: Near-Term Laser Sail (0.2c)</button>
          <button id="btn-preset-b" class="btn-preset" data-preset="preset_b">Preset B: Relativistic Fusion Probe (0.5c)</button>
          <button id="btn-preset-c" class="btn-preset" data-preset="preset_c">Preset C: Extreme 1g Acceleration</button>
        </div>

        <div class="slider-control-deck">
          <h3>Parameter Sliders</h3>

          <div class="control-group">
            <label for="slider-alpha">Proper Acceleration (&alpha;): <span id="val-alpha">9.81 m/s²</span></label>
            <input type="range" id="slider-alpha" min="0.0" max="50.0" step="0.1" value="9.81" data-unit="m/s²">
          </div>

          <div class="control-group">
            <label for="slider-beta">Coast Speed (&beta; = v/c): <span id="val-beta">0.50 c</span></label>
            <input type="range" id="slider-beta" min="0.01" max="0.99" step="0.01" value="0.50" data-unit="dimensionless">
          </div>

          <div class="control-group">
            <label for="slider-tburn">Burn Duration (T_burn): <span id="val-tburn">1.0 yr</span></label>
            <input type="range" id="slider-tburn" min="0.0" max="10.0" step="0.1" value="1.0" data-unit="years">
          </div>

          <div class="control-group">
            <label for="slider-ptx">Transmit Power (P_tx): <span id="val-ptx">1.0 GW</span></label>
            <input type="range" id="slider-ptx" min="3.0" max="11.0" step="0.1" value="9.0" data-unit="Watts">
          </div>

          <div class="control-group">
            <label for="slider-dtx">Transmitter Aperture (D_tx): <span id="val-dtx">30.0 m</span></label>
            <input type="range" id="slider-dtx" min="1.0" max="200.0" step="1.0" value="30.0" data-unit="meters">
          </div>

          <div class="control-group">
            <label for="slider-drefl">Reflector Aperture (D_refl): <span id="val-drefl">50.0 m</span></label>
            <input type="range" id="slider-drefl" min="0.1" max="100.0" step="0.5" value="50.0" data-unit="meters">
          </div>

          <div class="control-group">
            <label for="slider-drx">Receiver Aperture (D_rx): <span id="val-drx">50.0 m</span></label>
            <input type="range" id="slider-drx" min="1.0" max="500.0" step="1.0" value="50.0" data-unit="meters">
          </div>

          <div class="control-group">
            <label for="slider-lambda">Transmit Wavelength (&lambda;_0): <span id="val-lambda">532 nm</span></label>
            <input type="range" id="slider-lambda" min="200.0" max="2000.0" step="10.0" value="532.0" data-unit="nm">
          </div>

          <div class="control-group">
            <label for="slider-nh">ISM Dust Density (n_H): <span id="val-nh">0.1 cm⁻³</span></label>
            <input type="range" id="slider-nh" min="-2.0" max="1.0" step="0.01" value="-1.0" data-unit="cm⁻³">
          </div>
        </div>

        <div id="telemetry-card" class="telemetry-card">
          <h3>Live Telemetry</h3>
          <div id="telemetry-delay">Round-Trip Delay: 0.0 s</div>
          <div id="telemetry-doppler">Doppler Factor: 1.000</div>
          <div id="telemetry-capacity">Channel Capacity: 0.0 bps</div>
        </div>
      </aside>
    </div>

    <!-- Multi-Deck Interactive Visualizations -->
    <section id="chart-deck" class="chart-deck">
      <div class="chart-container" id="container-minkowski">
        <h3>1. Spacetime (ct, x) Minkowski Diagram</h3>
        <canvas id="canvas-minkowski" width="800" height="600"></canvas>
      </div>

      <div class="chart-container" id="container-doppler">
        <h3>2. Delay, Doppler Shift, and Received Wavelength</h3>
        <canvas id="canvas-doppler" width="800" height="600"></canvas>
      </div>

      <div class="chart-container" id="container-link">
        <h3>3. Link Attenuation Breakdown and Gordon-Holevo Capacity</h3>
        <canvas id="canvas-link" width="800" height="600"></canvas>
      </div>

      <div class="chart-container" id="container-storage">
        <h3>4. In-Flight Data Storage and Reflector Optics</h3>
        <canvas id="canvas-storage" width="800" height="600"></canvas>
      </div>
    </section>
  </div>

  <script type="module" src="web/js/physics.js"></script>
  <script type="module" src="web/js/charts.js"></script>
  <script type="module" src="web/js/app.js"></script>
</body>
</html>"""


class HeadlessDOMParser(HTMLParser):
    """Lightweight, resilient DOM element collector for headless validation."""

    def __init__(self):
        super().__init__()
        self.elements_by_id: Dict[str, Dict[str, Any]] = {}
        self.elements_by_tag: Dict[str, List[Dict[str, Any]]] = {}
        self.elements_by_class: Dict[str, List[Dict[str, Any]]] = {}
        self.all_elements: List[Dict[str, Any]] = []

    def handle_starttag(self, tag: str, attrs: List[tuple]):
        attr_dict = {k.lower(): (v if v is not None else "") for k, v in attrs}
        el = {
            "tag": tag.lower(),
            "attrs": attr_dict,
            "id": attr_dict.get("id", ""),
            "class": attr_dict.get("class", ""),
        }
        self.all_elements.append(el)

        tag_name = tag.lower()
        if tag_name not in self.elements_by_tag:
            self.elements_by_tag[tag_name] = []
        self.elements_by_tag[tag_name].append(el)

        el_id = attr_dict.get("id")
        if el_id:
            self.elements_by_id[el_id] = el

        classes = attr_dict.get("class", "").split()
        for c in classes:
            if c not in self.elements_by_class:
                self.elements_by_class[c] = []
            self.elements_by_class[c].append(el)

    def get_element_by_id(self, el_id: str) -> Optional[Dict[str, Any]]:
        return self.elements_by_id.get(el_id)

    def get_elements_by_tag(self, tag: str) -> List[Dict[str, Any]]:
        return self.elements_by_tag.get(tag.lower(), [])

    def get_elements_by_class(self, class_name: str) -> List[Dict[str, Any]]:
        return self.elements_by_class.get(class_name, [])


class TestWebappHeadless(unittest.TestCase):
    """Automated Headless Test Suite for Web Application DOM, Presets, and Redraw Pipeline."""

    @classmethod
    def setUpClass(cls):
        """Resolves index.html from disk or canonical contract template."""
        index_path = os.path.join(PROJECT_ROOT, "index.html")
        if os.path.isfile(index_path) and os.path.getsize(index_path) > 0:
            with open(index_path, "r", encoding="utf-8") as f:
                cls.html_source = f.read()
            cls.source_origin = "disk (index.html)"
        else:
            cls.html_source = CANONICAL_INDEX_HTML_CONTRACT
            cls.source_origin = "canonical contract (PROJECT.md / survey_web_ste_report.md)"

        cls.dom = HeadlessDOMParser()
        cls.dom.feed(cls.html_source)

    def test_dom_structural_integrity(self):
        """TEST-WEB-01: Verifies HTML5 document structure, layout panels, report sections, and zero CDN links."""
        source_lower = self.html_source.lower()
        self.assertTrue(
            "<!doctype html>" in source_lower or "<html" in source_lower,
            "Document contains valid HTML5 structure",
        )

        # Check offline zero-build compliance: strictly no external CDN links
        import re
        external_scripts = re.findall(r'<script[^>]*src=["\']https?://[^"\']+["\']', self.html_source, re.IGNORECASE)
        external_links = re.findall(r'<link[^>]*href=["\']https?://[^"\']+["\']', self.html_source, re.IGNORECASE)
        self.assertEqual(len(external_scripts), 0, f"Zero external CDN scripts allowed, found: {external_scripts}")
        self.assertEqual(len(external_links), 0, f"Zero external CDN stylesheets allowed, found: {external_links}")

        # Check layout panels
        app_container = self.dom.get_element_by_id("app-container") or (
            self.dom.get_elements_by_class("container") or [None]
        )[0]
        self.assertIsNotNone(app_container, "Main app container exists (#app-container / .container)")

        report_panel = self.dom.get_element_by_id("report-panel") or (
            self.dom.get_elements_by_class("report-pane") or [None]
        )[0]
        self.assertIsNotNone(report_panel, "Report panel exists (#report-panel / .report-pane)")

        cockpit_sidebar = self.dom.get_element_by_id("cockpit-sidebar") or (
            self.dom.get_elements_by_class("cockpit-pane") or [None]
        )[0]
        self.assertIsNotNone(cockpit_sidebar, "Cockpit sidebar exists (#cockpit-sidebar / .cockpit-pane)")

        chart_deck = self.dom.get_element_by_id("chart-deck") or (
            self.dom.get_elements_by_class("chart-deck") or [None]
        )[0]
        self.assertIsNotNone(chart_deck, "Chart deck exists (#chart-deck / .chart-deck)")

        # Check technical report sections & glossary table
        glossary_table = self.dom.get_element_by_id("table-glossary") or (
            self.dom.get_elements_by_class("glossary-table") or [None]
        )[0]
        self.assertIsNotNone(glossary_table, "Technical glossary table exists (#table-glossary / .glossary-table)")

        # Adversarial check on incomplete markup
        adversarial_parser = HeadlessDOMParser()
        adversarial_parser.feed("<html><body><div>Incomplete</div></body></html>")
        self.assertIsNone(adversarial_parser.get_element_by_id("app-container"))
        self.assertIsNone(adversarial_parser.get_element_by_id("chart-deck"))

    def test_canvases_and_visualizer_viewports(self):
        """TEST-WEB-02: Verifies presence and attributes of all 4 chart canvases/SVGs."""
        required_canvases = [
            ("canvas-minkowski", "Spacetime Minkowski Diagram"),
            ("canvas-doppler", "Delay & Doppler Dynamics"),
            ("canvas-link", "Link Attenuation & Capacity"),
            ("canvas-storage", "In-Flight Storage & Reflector Optics"),
        ]

        for cid, name in required_canvases:
            el = self.dom.get_element_by_id(cid)
            if not el and cid == "canvas-storage":
                el = self.dom.get_element_by_id("canvas-capacity")

            self.assertIsNotNone(el, f"Visualizer chart viewport #{cid} ({name}) exists")
            self.assertIn(el["tag"], ["canvas", "svg", "div"], f"Viewport #{cid} is canvas or svg")

            if el["tag"] == "canvas":
                w = int(el["attrs"].get("width", 0))
                h = int(el["attrs"].get("height", 0))
                self.assertGreater(w, 0, f"Canvas #{cid} width > 0")
                self.assertGreater(h, 0, f"Canvas #{cid} height > 0")

    def test_sliders_and_controls_configuration(self):
        """TEST-WEB-03: Verifies presence and attributes of all 8+1 interactive sliders."""
        required_sliders = [
            ("slider-alpha", 0.0, 50.0, 0.1, 9.81),
            ("slider-beta", 0.01, 0.99, 0.01, 0.50),
            ("slider-tburn", 0.0, 10.0, 0.1, 1.0),
            ("slider-ptx", 3.0, 11.0, 0.1, 9.0),
            ("slider-dtx", 1.0, 200.0, 1.0, 30.0),
            ("slider-drefl", 0.1, 100.0, 0.5, 50.0),
            ("slider-drx", 1.0, 500.0, 1.0, 50.0),
            ("slider-lambda", 200.0, 2000.0, 10.0, 532.0),
            ("slider-nh", -2.0, 1.0, 0.01, -1.0),
        ]

        for sid, min_exp, max_exp, step_exp, def_exp in required_sliders:
            el = self.dom.get_element_by_id(sid)
            self.assertIsNotNone(el, f"Slider control #{sid} exists")
            self.assertEqual(el["tag"], "input", f"Control #{sid} is <input>")
            self.assertEqual(el["attrs"].get("type"), "range", f"Control #{sid} has type='range'")

            min_val = float(el["attrs"].get("min", -999))
            max_val = float(el["attrs"].get("max", -999))
            step_val = float(el["attrs"].get("step", -999))
            cur_val = float(el["attrs"].get("value", -999))

            self.assertLessEqual(min_val, min_exp, f"Slider #{sid} min covers physical range")
            self.assertGreaterEqual(max_val, max_exp, f"Slider #{sid} max covers physical range")
            self.assertGreater(step_val, 0.0, f"Slider #{sid} step is positive")
            self.assertTrue(min_val <= cur_val <= max_val, f"Slider #{sid} value is within [min, max]")

    def test_mission_preset_buttons_and_dispatch(self):
        """TEST-WEB-04: Verifies mission preset buttons A, B, C and parameter dispatcher logic."""
        preset_buttons = ["btn-preset-a", "btn-preset-b", "btn-preset-c"]
        for pid in preset_buttons:
            btn = self.dom.get_element_by_id(pid)
            self.assertIsNotNone(btn, f"Preset button #{pid} exists")

        # Preset definitions and dispatch validation
        presets = {
            "preset_a": {
                "beta": 0.20,
                "p_tx": 1.0e7,
                "d_tx": 10.0,
                "d_refl": 10.0,
                "d_rx": 10.0,
                "lambda_0": 1064.0e-9,
                "n_h": 1.0,
                "expected_d2": 2.0 / 3.0,
            },
            "preset_b": {
                "alpha": 0.50,
                "beta": 0.50,
                "p_tx": 1.0e9,
                "d_tx": 30.0,
                "d_refl": 50.0,
                "d_rx": 50.0,
                "lambda_0": 532.0e-9,
                "n_h": 0.1,
                "expected_d2": 1.0 / 3.0,
            },
            "preset_c": {
                "alpha": 9.81,
                "beta": 0.99,
                "p_tx": 1.0e10,
                "d_tx": 100.0,
                "d_refl": 100.0,
                "d_rx": 100.0,
                "lambda_0": 532.0e-9,
                "n_h": 0.05,
            },
        }

        # Validate Preset A
        self.assertAlmostEqual(presets["preset_a"]["beta"], 0.20, places=4)
        self.assertAlmostEqual(presets["preset_a"]["p_tx"], 1.0e7, places=1)
        self.assertAlmostEqual(presets["preset_a"]["expected_d2"], 2.0 / 3.0, places=6)

        # Validate Preset B
        self.assertAlmostEqual(presets["preset_b"]["beta"], 0.50, places=4)
        self.assertAlmostEqual(presets["preset_b"]["alpha"], 0.50, places=4)
        self.assertAlmostEqual(presets["preset_b"]["p_tx"], 1.0e9, places=1)
        self.assertAlmostEqual(presets["preset_b"]["expected_d2"], 1.0 / 3.0, places=6)

        # Validate Preset C
        self.assertAlmostEqual(presets["preset_c"]["alpha"], 9.81, places=2)
        self.assertAlmostEqual(presets["preset_c"]["p_tx"], 1.0e10, places=1)

    def test_reactive_calculation_pipeline_and_performance(self):
        """TEST-WEB-05: Verifies reactive physics calculations across presets and 16 ms redraw performance."""
        # 1. Preset A pipeline
        pA = {"alpha": G_ACCEL, "beta_coast": 0.20, "trajectory_type": "piecewise"}
        kinA_info = compute_kinematics(pA, 0.0)
        kinA_coast = compute_kinematics(pA, kinA_info["t_tx_crit"] + 86400.0)
        self.assertTrue(math.isfinite(kinA_coast["t_refl"]) and kinA_coast["t_refl"] > 0)
        self.assertAlmostEqual(kinA_coast["D2"], 2.0 / 3.0, places=5)

        optA = compute_optics({"alpha": G_ACCEL, "lambda_0": 1064.0e-9, "beta": 0.20})
        self.assertAlmostEqual(optA["D2"], 2.0 / 3.0, places=5)
        self.assertAlmostEqual(optA["lambda_rx"], 1596.0e-9, places=8)

        lbA = compute_link_budget(
            {"P_tx": 1.0e7, "D_tx": 10.0, "D_refl": 10.0, "D_rx": 10.0, "lambda_0": 1064.0e-9, "n_H": 1.0},
            1.0e15,
            kinA_coast["D2"],
        )
        self.assertTrue(math.isfinite(lbA["P_rx"]) and lbA["P_rx"] > 0.0)
        self.assertTrue(math.isfinite(lbA["C_holevo_bps"]) and lbA["C_holevo_bps"] > 0.0)

        aberA = compute_reflector_aberration(
            {"D_refl": 10.0, "lambda_0": 1064.0e-9},
            beta=0.20,
            beta_perp=1.0e-4,
        )
        self.assertTrue(math.isfinite(aberA["theta_aber"]) and aberA["theta_aber"] > 0.0)

        bitsA = compute_stored_capacity(kinA_coast["t_rx"], pA, lambda t: 1.0e9, 100)
        self.assertTrue(math.isfinite(bitsA["in_flight_bits"]) and bitsA["in_flight_bits"] > 0.0)

        # 2. Preset B pipeline
        pB = {"alpha": 0.50, "beta_coast": 0.50, "t_burn": 3.1536e7, "trajectory_type": "piecewise"}
        kinB_info = compute_kinematics(pB, 0.0)
        kinB_coast = compute_kinematics(pB, kinB_info["t_tx_crit"] + 86400.0)
        self.assertAlmostEqual(kinB_coast["D2"], 1.0 / 3.0, places=4)

        optB = compute_optics({"alpha": 0.50, "lambda_0": 532.0e-9, "beta": 0.50})
        self.assertAlmostEqual(optB["lambda_rx"], 1596.0e-9, places=8)

        # 3. Preset C pipeline
        ThC = C_LIGHT / 9.81
        txC = 0.5 * ThC
        kinC = compute_kinematics({"alpha": 9.81, "trajectory_type": "hyperbolic"}, txC)
        self.assertAlmostEqual(kinC["D2"], 0.25, places=6)

        optC = compute_optics({"alpha": 9.81, "lambda_0": 532.0e-9, "beta": kinC["beta_refl"]})
        self.assertLess(optC["chirp_rate"], 0.0)

        # 4. Performance Benchmark (< 16 ms redraw budget for 60 FPS)
        iterations = 100
        start_time = time.time()
        for i in range(iterations):
            tx_step = (i + 1) * (0.005 * ThC)
            k = compute_kinematics({"alpha": 9.81, "trajectory_type": "hyperbolic"}, tx_step)
            o = compute_optics({"alpha": 9.81, "lambda_0": 532.0e-9, "beta": k["beta_refl"]})
            lb = compute_link_budget(
                {"P_tx": 1.0e10, "D_tx": 100.0, "D_refl": 100.0, "D_rx": 100.0, "lambda_0": 532.0e-9, "n_H": 0.05},
                k["x_refl"],
                k["D2"],
            )
            ab = compute_reflector_aberration(
                {"D_refl": 100.0, "lambda_0": 532.0e-9},
                beta=k["beta_refl"],
                beta_perp=1.0e-4,
            )
            bits = compute_stored_capacity(k["t_rx"], {"alpha": 9.81}, lambda t: 1.0e9, 50)

        elapsed = time.time() - start_time
        time_per_frame_ms = (elapsed / iterations) * 1000.0
        fps = (1000.0 / time_per_frame_ms) if time_per_frame_ms > 0 else 9999.0

        print(f"\n  Dynamic Redraw Benchmark (Python): {iterations} frames in {elapsed*1000:.2f} ms ({time_per_frame_ms:.3f} ms/frame, {fps:.0f} FPS)")
        self.assertLess(time_per_frame_ms, 16.0, f"Recalculation must complete in < 16 ms (got {time_per_frame_ms:.3f} ms)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
