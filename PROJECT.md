# Project: Relativistic Optical Delay-Line Data Storage

## Architecture
The system models, analyzes, documents, and interactively simulates an interstellar optical delay-line data storage medium consisting of an Earth/orbital/lunar laser transmitter, a retroreflector mounted on a radially receding relativistic spacecraft, and a quantum optical receiving antenna array.

The project is structured into a Dual-Track Architecture:
1. **Implementation Track**:
   - Core mathematical physics engine (Python reference and ES6 client runtime).
   - ASD-STE100 technical engineering report with full mathematical derivations and quantitative TRL 1-3 vs 4-6 tables.
   - Standalone zero-build interactive web application (`index.html`) featuring simulation cockpit, 3 mission presets, 8 interactive sliders, and 4 real-time Canvas/SVG visualizations.
2. **E2E Testing Track**:
   - Independent verification suite testing physics benchmarks, ASD-STE100 prose compliance, and headless web application DOM/render behavior.
   - Publishes `TEST_READY.md` upon suite completion.

```
relativistic_reflector_storage/
├── index.html                     # Standalone self-contained web app & STE report
├── web/
│   ├── css/style.css              # Responsive styling, dual-pane layout, cockpit
│   └── js/
│       ├── physics.js             # ES6 physics engine (kinematics, link, capacity)
│       ├── charts.js              # Canvas/SVG renderers (Minkowski, Doppler, Link, Storage)
│       └── app.js                 # UI controllers, sliders, presets, event listeners
├── src/
│   └── physics/
│       ├── __init__.py
│       ├── kinematics.py          # Trajectory, retarded-time, horizon solver
│       ├── optics.py              # Doppler, chirp, Lorentz aberration & dihedral offset
│       ├── link_budget.py         # Two-way diffraction & Beer-Lambert ISM extinction
│       └── capacity.py            # Gordon-Holevo & Shannon quantum capacity
├── tools/
│   └── lint_ste.py                # 8-stage ASD-STE100 prose linter CLI
├── tests/
│   ├── test_physics_engine.py     # 10 physics unit/integration analytical tests
│   ├── test_ste_compliance.py     # 6 automated STE prose rule verification tests
│   └── test_webapp_headless.py    # 5 DOM/render/slider verification tests
├── run_tests.py                   # Master test runner executing all suites
├── PROJECT.md                     # Global architecture, feature inventory, milestones
├── TEST_INFRA.md                  # Test methodology, tiers, and coverage inventory
└── TEST_READY.md                  # E2E test suite readiness artifact
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | Hyperbolic & Piecewise Kinematics | Exact closed-form $t_{\text{refl}}, x_{\text{refl}}$ and retarded-time equations | M1, MT1 | Survey 1 §1 |
| F02 | Rindler Horizon Upload Cutoff | Proof and numerical cutoff $t_{\text{tx}} \to c/\alpha$ (353.82 days at $1g$) | M1, MT1 | Survey 1 §1 |
| F03 | Relativistic Two-Way Doppler & Chirp | $D_2 = (1-\beta)/(1+\beta)$ factor and acceleration chirp $df_{\text{rx}}/dt_{\text{rx}}$ | M1, MT1 | Survey 1 §2 |
| F04 | Time-Integrated Bit Conservation | Analytical & numerical proof $\int R_{\text{tx}} dt - \int R_{\text{rx}} dt = B_{\text{flight}}$ | M1, MT1 | Survey 1 §2 |
| F05 | Two-Way Link Budget & Diffraction | Near-to-far field $1/d^4$ geometric scaling with relativistic $D_2^2$ penalty | M1, MT1 | Survey 1 §3 |
| F06 | Beer-Lambert ISM Dust Extinction | Wavelength-dependent extinction $A(\lambda) \propto \lambda^{-1.7}$ over path $R(t)$ | M1, MT1 | Survey 1 §3 |
| F07 | Gordon-Holevo Quantum Capacity | Bosonic channel capacity $C = g(N+N_b)-g(N_b)$ in photon-starved regime | M1, MT1 | Survey 1 §3 |
| F08 | Moving Retroreflector Lorentz Aberration | 4-wavevector transformation, velocity aberration $\theta_{\text{aber}} \approx 2\beta_\perp$, dihedral/cat's-eye compensation | M1, MT1 | Survey 1 §4 |
| F09 | Spacecraft Subsystem Engineering | Propulsion (laser sail vs fusion/antimatter), mass budget, thermal dissipation, dust Whipple/magnetic shield | M2 | Survey 2 §1 |
| F10 | Corner Reflector Subsystem Engineering | Hollow trihedral vs cat's-eye, surface flatness $\lambda/20$, dihedral tolerances, broadband coatings, dust erosion | M2 | Survey 2 §2 |
| F11 | Transmitting Antenna Engineering | Terrestrial vs lunar crater siting, phased-array laser power/aperture, lead-angle PAT, M-PPM modulation | M2 | Survey 2 §3 |
| F12 | Receiving Antenna Engineering | Multi-tier cascaded architecture (NIR $\to$ FIR/THz), WSi SNSPDs, SIS heterodyne, chirped local oscillator | M2 | Survey 2 §4 |
| F13 | Current vs Speculative TRL Tables | Quantitative parameter tables distinguishing TRL 4-6 from TRL 1-3 across subsystems | M2 | Survey 2 §5 |
| F14 | ASD-STE100 Compliant Technical Text | Strict STE writing ($\le 25/\le 20$ words, passive $<5\%$, banned words eliminated, technical glossary) | M2, MT1 | Survey 3 §3 |
| F15 | Zero-Build Standalone Web Application | Pure HTML5/CSS/ES6 `index.html` executable offline with zero build step | M3, MT2 | Survey 3 §5 |
| F16 | UI Cockpit with Presets & Sliders | Presets A ($0.2c$), B ($0.5c$), C ($1g$ acceleration) and 8 sliders ($\alpha, \beta, T_{\text{burn}}, P_{\text{tx}}, D_{\text{tx}}, D_{\text{refl}}, D_{\text{rx}}, \lambda_0, n_H$) | M3, MT2 | Survey 3 §5 |
| F17 | Interactive Diagram 1: Minkowski Spacetime | Spacetime $(ct, x)$ diagram with light cones, worldline, reflected rays, Rindler horizon | M3, MT2 | Survey 3 §5 |
| F18 | Interactive Diagram 2: Delay & Doppler Dynamics | Round-trip delay $\Delta t$, Doppler factor $D_2$, and received wavelength vs mission time | M3, MT2 | Survey 3 §5 |
| F19 | Interactive Diagram 3: Link Attenuation & Capacity | Stacked loss breakdown (diffraction, dust, relativistic) and Gordon-Holevo capacity vs distance | M3, MT2 | Survey 3 §5 |
| F20 | Interactive Diagram 4: In-Flight Bits & Reflector Optics | In-flight bits $B_{\text{flight}}(t)$ timeline and 2D/3D retroreflector aberration beam profile | M3, MT2 | Survey 3 §5 |
| F21 | Automated E2E Verification & Audit Suite | Master test runner `run_tests.py` testing physics benchmarks, STE linter, and headless web checks | MT1, MT2, M4 | Survey 3 §6 |

## Milestones

### Implementation Track
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Physics Core Engine | Python reference (`src/physics/`) and ES6 module (`web/js/physics.js`) implementing F01–F08 | none | DONE |
| M2 | ASD-STE100 Report Authoring | Full engineering report text adhering strictly to STE rules, covering F09–F14 with math & TRL tables | M1 | DONE |
| M3 | Interactive Web App & Visualizers | Self-contained `index.html`, UI cockpit, presets, 8 sliders, and 4 canvas/SVG charts (F15–F20) | M1, M2 | DONE |
| M4 | Final E2E Integration & Verification | Pass 100% of E2E tests (`TEST_READY.md`), adversarial stress testing, and forensic audit (F21) | M3, MT2 | DONE |

### E2E Testing Track
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| MT1 | Test Harness, Physics Benchmark & STE Linter | Master runner `run_tests.py`, `test_physics_engine.py` (10 tests), and `tools/lint_ste.py` + `test_ste_compliance.py` | none | DONE |
| MT2 | Headless Web App Render & Dynamic Redraw Suite | `tests/test_webapp_headless.py` (5 tests verifying DOM, SVG/Canvas, slider callbacks, presets, no runtime errors); publish `TEST_READY.md` | MT1 | DONE |

## Interface Contracts

### Physics Engine ↔ Client UI & Test Suite
- `compute_kinematics(params, t_tx)`:
  - Input: `{ alpha, beta_coast, t_burn, t_tx }`
  - Output: `{ t_refl, x_refl, t_rx, delta_t, beta_refl, gamma_refl, D2, horizon_cutoff, is_past_horizon }`
  - Units: SI ($m, s, m/s^2$, dimensionless)
- `compute_link_budget(params, x_refl, D2)`:
  - Input: `{ P_tx, D_tx, D_refl, D_rx, lambda_0, n_H }`, `x_refl`, `D2`
  - Output: `{ eta_geom, eta_dust, eta_rel, P_rx, photon_flux_rx, C_holevo_bps, bits_per_photon }`
- `compute_reflector_aberration(params, beta, beta_perp)`:
  - Input: `{ D_refl, lambda_0, beta, beta_perp }`
  - Output: `{ theta_diff, theta_aber, decoupling_ratio, delta_dihedral_arcsec, requires_active_comp }`

### ASD-STE100 Report Text ↔ Linter Tool
- Input text: Markdown or HTML blocks.
- Linter CLI: `python3 tools/lint_ste.py --file <path> [--json]`
- Exit codes: `0` = 100% compliant (descriptive $\le 25$ words, procedural $\le 20$ words, passive $<5\%$, 0 banned words); `1` = rule violations found.

### Web Application UI State ↔ Visualizer Deck
- Preset dispatch: `setPreset('preset_a' | 'preset_b' | 'preset_c')` updates all 8 slider values and re-renders all 4 charts.
- Slider event: `onSliderChange(paramName, value)` triggers reactive physics recompute and redraws Canvas/SVG in $< 16\text{ ms}$ (60 FPS).

## Code Layout
- Web root: `/Users/vanhoucke/.gemini/antigravity/scratch/relativistic_reflector_storage/index.html`
- Styles: `/Users/vanhoucke/.gemini/antigravity/scratch/relativistic_reflector_storage/web/css/style.css`
- JavaScript modules: `/Users/vanhoucke/.gemini/antigravity/scratch/relativistic_reflector_storage/web/js/{physics.js, charts.js, app.js}`
- Python core: `/Users/vanhoucke/.gemini/antigravity/scratch/relativistic_reflector_storage/src/physics/{kinematics.py, optics.py, link_budget.py, capacity.py}`
- Linter tool: `/Users/vanhoucke/.gemini/antigravity/scratch/relativistic_reflector_storage/tools/lint_ste.py`
- Test suite: `/Users/vanhoucke/.gemini/antigravity/scratch/relativistic_reflector_storage/tests/{test_physics_engine.py, test_ste_compliance.py, test_webapp_headless.py}`
- Master runner: `/Users/vanhoucke/.gemini/antigravity/scratch/relativistic_reflector_storage/run_tests.py`
