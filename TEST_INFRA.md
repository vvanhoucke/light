# E2E Test Infra: Relativistic Optical Delay-Line Data Storage

## Test Philosophy
- Opaque-box, requirement-driven independent verification derived strictly from `ORIGINAL_REQUEST.md` and user-facing specifications.
- Dual methodology: Analytical Benchmark Validation (Kinematics, Horizon, Doppler, Link Budget, Gordon-Holevo) + Formal Rule Linting (ASD-STE100 grammar and vocabulary constraints) + Headless DOM/UI verification.

## Feature Inventory & Test Matrix
| # | Feature | Source (Requirement) | Tier 1 (Unit) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---------|----------------------|:-------------:|:-----------------:|:-----------------:|:-----------------:|
| F01 | Hyperbolic & Piecewise Kinematics | R1 §1 | ✓ (5 tests) | ✓ (5 tests) | ✓ | ✓ |
| F02 | Rindler Horizon Upload Cutoff | R1 §1 | ✓ (5 tests) | ✓ (5 tests) | ✓ | ✓ |
| F03 | Relativistic Two-Way Doppler & Chirp | R1 §2 | ✓ (5 tests) | ✓ (5 tests) | ✓ | ✓ |
| F04 | Time-Integrated Bit Conservation | R1 §2 | ✓ (5 tests) | ✓ (5 tests) | ✓ | ✓ |
| F05 | Two-Way Link Budget & Diffraction | R1 §3 | ✓ (5 tests) | ✓ (5 tests) | ✓ | ✓ |
| F06 | Beer-Lambert ISM Dust Extinction | R1 §3 | ✓ (5 tests) | ✓ (5 tests) | ✓ | ✓ |
| F07 | Gordon-Holevo Quantum Capacity | R1 §3 | ✓ (5 tests) | ✓ (5 tests) | ✓ | ✓ |
| F08 | Moving Retroreflector Lorentz Aberration | R1 §4 | ✓ (5 tests) | ✓ (5 tests) | ✓ | ✓ |
| F09 | Spacecraft Subsystem Engineering Tables | R2 §1 | ✓ (Check TRL) | ✓ (Bounds) | ✓ | ✓ |
| F10 | Corner Reflector Subsystem Tables | R2 §2 | ✓ (Check TRL) | ✓ (Tolerances) | ✓ | ✓ |
| F11 | Transmitting Antenna Subsystem Tables | R2 §3 | ✓ (Check TRL) | ✓ (Lead angle) | ✓ | ✓ |
| F12 | Receiving Antenna Subsystem Tables | R2 §4 | ✓ (Check TRL) | ✓ (Redshift) | ✓ | ✓ |
| F13 | Current vs Speculative TRL Distinction | R2 §5 | ✓ (Schema) | ✓ (Completeness) | ✓ | ✓ |
| F14 | ASD-STE100 Grammar & Word Limits | R3 §1 | ✓ (Rules 1-5) | ✓ (Word limits) | ✓ | ✓ |
| F15 | Zero-Build Standalone Web Application | R3 §2 | ✓ (DOM render) | ✓ (file:// load) | ✓ | ✓ |
| F16 | UI Cockpit Presets & Sliders | R3 §2 | ✓ (Presets A/B/C) | ✓ (Slider ranges) | ✓ | ✓ |
| F17 | Minkowski Spacetime Diagram | R3 §2 (1) | ✓ (Ray trace) | ✓ (Horizon asymptote) | ✓ | ✓ |
| F18 | Delay & Doppler Dynamics Chart | R3 §2 (2) | ✓ (Curve points) | ✓ (Spectral shift) | ✓ | ✓ |
| F19 | Link Budget & Capacity Chart | R3 §2 (3) | ✓ (Loss breakdown) | ✓ (Photon limit) | ✓ | ✓ |
| F20 | In-Flight Bits & Aberration Optics | R3 §2 (4) | ✓ (Integral) | ✓ (Decoupling cone) | ✓ | ✓ |
| F21 | Master Verification Harness | R4 §1 | ✓ (Exit 0) | ✓ (Error capture) | ✓ | ✓ |

## Test Architecture
- **Master Test Runner**: `run_tests.py`
  - Invocation: `python3 run_tests.py`
  - Semantics: Runs all test modules sequentially. Returns exit code 0 if all tests pass; returns non-zero on any failure.
- **Physics Test Suite**: `tests/test_physics_engine.py`
  - Kinematics & retarded time solver benchmark.
  - Horizon asymptote $t_{\text{tx}} \to c/\alpha$.
  - Two-way Doppler factor $D_2 = (1-\beta)/(1+\beta)$ and chirp rate.
  - Numerical bit conservation integral $\Delta B = 0$.
  - Two-way geometric link budget $1/d^4$ scaling.
  - Beer-Lambert dust extinction across shifted wavelengths.
  - Gordon-Holevo capacity vs SNR.
  - Lorentz wavevector transformation & velocity aberration decoupling ratio.
- **ASD-STE100 Prose Linter Suite**: `tests/test_ste_compliance.py`
  - Executes `tools/lint_ste.py` on the report text.
  - Asserts descriptive sentence length $\le 25$ words.
  - Asserts procedural sentence length $\le 20$ words.
  - Asserts passive voice percentage $< 5.0\%$.
  - Asserts zero banned ambiguous words (`since`, `as`, `may`, `could`, `should`).
  - Asserts presence and completeness of technical terms in the glossary.
- **Headless Web Application Test Suite**: `tests/test_webapp_headless.py`
  - Validates `index.html` structure, DOM elements for all 4 charts, slider elements, and presets.
  - Executes physics calculations across presets and verifies non-NaN, positive outputs.
  - Tests SVG/Canvas element initialization and attributes.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Near-Term Laser Sail ($0.2c$ coast) | F01, F03, F05, F08, F16, F18, F20 | High |
| 2 | Relativistic Fusion Probe ($0.5c$ coast) | F01, F03, F05, F06, F07, F16, F19 | High |
| 3 | Extreme Continuous $1g$ Acceleration ($0.99c+$) | F01, F02, F03, F04, F07, F08, F16, F17 | Extreme |
| 4 | Transverse Aberration Decoupling & Beam Steering | F08, F10, F11, F20 | High |
| 5 | Deep-Space In-Flight Storage Buffer Ramp-Up | F04, F07, F18, F20 | High |

## Coverage Thresholds
- Tier 1: $\ge 5$ tests per core physics feature
- Tier 2: Boundary value tests at horizon, $\beta \to 0$, $\beta \to 0.999$, extreme distances ($4.24\text{ ly}$)
- Tier 3: Pairwise cross-feature interactions (kinematics $\times$ Doppler, Doppler $\times$ link budget, motion $\times$ aberration)
- Tier 4: $\ge 5$ end-to-end mission scenarios
