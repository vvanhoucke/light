// tests/verify_ste_compliance.js
// Verification suite for ASD-STE100 linter engine in JSC

import { lintText, APPROVED_GLOSSARY, BANNED_WORDS } from '../tools/lint_ste_module.js';

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    print(`  [PASS] ${testName}`);
    passed++;
  } else {
    print(`  [FAIL] ${testName}: ${detail}`);
    failed++;
  }
}

print("============================================================");
print(" RUNNING ASD-STE100 COMPLIANCE TESTS (JSC ENGINE)");
print("============================================================");

// Test 1: Compliant STE Text
print("\nTest 1: test_compliant_ste_text");
const text1 = `# System Overview

The ground station transmits laser pulses to the spacecraft.
The optical retroreflector returns the pulses toward Earth.
This process stores data in the intervening spacetime fabric.

## Operating Instructions

1. Select the mission preset.
2. Set the transmitter power.
3. Compute the round-trip delay.
`;
const res1 = lintText(text1);
assert(res1.status === "PASS", "compliant text passes status");
assert(res1.summary.total_violations === 0, "compliant text has 0 violations");
assert(res1.summary.passive_sentences === 0, "compliant text has 0 passive sentences");

// Test 2: Descriptive Sentence Length
print("\nTest 2: test_descriptive_sentence_length_limit");
const shortDesc = "The laser transmitter emits optical pulses toward the spacecraft retroreflector to establish a data storage delay line.";
const resShortDesc = lintText(shortDesc);
assert(resShortDesc.summary.rule_1_violations === 0, "short descriptive sentence passes");

const longDesc = "The laser transmitter emits coherent optical pulses toward the distant spacecraft retroreflector to establish a relativistic optical data storage delay line that stores information in the spacetime geometry for long durations.";
const resLongDesc = lintText(longDesc);
assert(resLongDesc.status === "FAIL", "long descriptive sentence fails");
assert(resLongDesc.summary.rule_1_violations >= 1, "long descriptive sentence has rule 1 violation");

// Test 3: Procedural Sentence Length
print("\nTest 3: test_procedural_sentence_length_limit");
const shortProc = "1. Set the transmitter power slider.";
const resShortProc = lintText(shortProc);
assert(resShortProc.summary.rule_1_violations === 0, "short procedural sentence passes");

const longProc = "1. Set the transmitter power slider to one hundred gigawatts and observe the resulting received optical power on the live telemetry dashboard card.";
const resLongProc = lintText(longProc);
assert(resLongProc.status === "FAIL", "long procedural sentence fails");
assert(resLongProc.summary.rule_1_violations >= 1, "long procedural step has rule 1 violation");

// Test 4: Passive Voice Detection and Ceiling
print("\nTest 4: test_passive_voice_detection_and_ceiling");
const passiveSingle = "The optical pulse was reflected by the retroreflector.";
const resPassive = lintText(passiveSingle);
assert(resPassive.status === "FAIL", "single passive sentence fails ceiling");
assert(resPassive.summary.passive_sentences === 1, "single passive sentence detected");

const activeSingle = "The retroreflector reflected the optical pulse.";
const resActive = lintText(activeSingle);
assert(resActive.status === "PASS", "active rewrite passes");
assert(resActive.summary.passive_sentences === 0, "active rewrite has 0 passive");

// Test 5: Banned Ambiguous Words
print("\nTest 5: test_banned_ambiguous_words");
const bannedExamples = [
  ["We use lasers since the velocity is high.", "since"],
  ["The frequency drops as the vehicle accelerates.", "as"],
  ["The system could reach higher speeds.", "could"],
  ["The operator should inspect the mirror.", "should"],
  ["Radiation pressure may deflect the sail.", "may"],
  ["The payload contains cameras, sensors, etc.", "etc"],
  ["The mission requires several ground stations.", "several"]
];
for (const [sText, word] of bannedExamples) {
  const res = lintText(sText);
  const found = res.violations.some(v => v.rule === "RULE_3_BANNED_WORD" && v.word === word);
  assert(found, `flags banned word '${word}' in: "${sText}"`);
}

// Exemptions
const exempt1 = "The architecture uses optical components such as lenses and mirrors.";
const resExempt1 = lintText(exempt1);
assert(resExempt1.summary.rule_3_violations === 0, "exempts 'such as'");

const exempt2 = "The detector measures pulse arrival time as well as signal power.";
const resExempt2 = lintText(exempt2);
assert(resExempt2.summary.rule_3_violations === 0, "exempts 'as well as'");

// Test 6: Noun Cluster Detection
print("\nTest 6: test_noun_cluster_detection");
const clusterText = "The ground optical transceiver aperture diameter measures ten meters.";
const resCluster = lintText(clusterText);
assert(resCluster.status === "FAIL", "flags noun cluster");
assert(resCluster.summary.rule_5_violations >= 1, "rule 5 violation recorded");

const cleanClusterText = "The diameter of the ground optical transceiver aperture measures ten meters.";
const resCleanCluster = lintText(cleanClusterText);
assert(resCleanCluster.summary.rule_5_violations === 0, "rewritten cluster passes");

// Test 7: Technical Glossary and Forbidden Synonyms
print("\nTest 7: test_technical_glossary_schema_and_forbidden_synonyms");
assert(Object.keys(APPROVED_GLOSSARY).length >= 20, "glossary has at least 20 terms");

const badSynonym = "The spacecraft carries a trihedral reflector to bounce light.";
const resBadSynonym = lintText(badSynonym);
assert(resBadSynonym.status === "FAIL", "flags forbidden synonym 'trihedral reflector'");
const synViol = resBadSynonym.violations.find(v => v.rule === "RULE_4_FORBIDDEN_SYNONYM");
assert(synViol && synViol.term === "Corner-Cube Reflector", "identifies term as Corner-Cube Reflector");

// Test 8: Math and Code Shielding
print("\nTest 8: test_math_and_code_shielding");
const mathDoc = `# Document
The equation $E = mc^2$ governs relativistic kinetic energy.

$$\\Delta t = \\frac{2d}{c}$$

The calculation confirms flat spacetime.
`;
const resMath = lintText(mathDoc);
assert(resMath.status === "PASS", "shielded math passes");
assert(resMath.summary.descriptive_sentences === 2, "display math is not counted as sentence");

print("\n============================================================");
print(` COMPLIANCE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
print("============================================================");
if (failed > 0) {
  throw new Error(`${failed} compliance assertions failed`);
}
