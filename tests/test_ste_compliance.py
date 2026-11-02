"""
tests/test_ste_compliance.py — Test suite for ASD-STE100 Linter & Compliance Rules

Validates that tools/lint_ste.py correctly implements the 8-stage ASD-STE100 linter:
  1. Identifies compliant STE text (Rule 1, Rule 2, Rule 3, Rule 4, Rule 5).
  2. Flags descriptive sentences exceeding 25 words.
  3. Flags procedural sentences exceeding 20 words.
  4. Detects passive voice constructions and enforces the <5.0% incidence ceiling.
  5. Flags banned ambiguous words (since, as, could, should, may, etc.) with exemptions for 'such as'.
  6. Flags noun clusters of 4 or more consecutive nouns.
  7. Validates the 20-term technical glossary and detects forbidden synonyms.
  8. Verifies math and code block shielding and token counting.
"""

import sys
import os
import unittest

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tools.lint_ste import STELinter, APPROVED_GLOSSARY, BANNED_WORDS


class TestSTECompliance(unittest.TestCase):
    """Test suite for ASD-STE100 rule validation and linter execution."""

    def setUp(self):
        self.linter = STELinter(strict=False)
        self.strict_linter = STELinter(strict=True)

    def test_compliant_ste_text(self):
        """Verify that compliant ASD-STE100 text passes all checks with zero violations."""
        text = (
            "# System Overview\n\n"
            "The ground station transmits laser pulses to the spacecraft.\n"
            "The optical retroreflector returns the pulses toward Earth.\n"
            "This process stores data in the intervening spacetime fabric.\n\n"
            "## Operating Instructions\n\n"
            "1. Select the mission preset.\n"
            "2. Set the transmitter power.\n"
            "3. Compute the round-trip delay.\n"
        )
        result = self.linter.lint_text(text, file_path="test_compliant.md")
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["summary"]["total_violations"], 0)
        self.assertEqual(result["summary"]["rule_1_violations"], 0)
        self.assertEqual(result["summary"]["rule_2_violations"], 0)
        self.assertEqual(result["summary"]["rule_3_violations"], 0)
        self.assertEqual(result["summary"]["passive_sentences"], 0)
        self.assertGreater(result["summary"]["total_sentences"], 0)

    def test_descriptive_sentence_length_limit(self):
        """Rule 1: Descriptive sentences must not exceed 25 words."""
        # Compliant descriptive sentence (exactly 20 words)
        short_text = "The laser transmitter emits coherent optical pulses toward the distant spacecraft retroreflector to establish a relativistic optical data storage delay line."
        res_short = self.linter.lint_text(short_text)
        self.assertEqual(res_short["summary"]["rule_1_violations"], 0)

        # Over-length descriptive sentence (28 words)
        long_text = (
            "The laser transmitter emits coherent optical pulses toward the distant spacecraft retroreflector "
            "to establish a relativistic optical data storage delay line that stores information in the spacetime "
            "geometry for long durations."
        )
        res_long = self.linter.lint_text(long_text)
        self.assertEqual(res_long["status"], "FAIL")
        self.assertGreaterEqual(res_long["summary"]["rule_1_violations"], 1)
        violations = [v for v in res_long["violations"] if v["rule"] == "RULE_1_SENTENCE_LENGTH"]
        self.assertTrue(any(v["limit"] == 25 for v in violations))
        self.assertTrue(any(v["word_count"] > 25 for v in violations))

    def test_procedural_sentence_length_limit(self):
        """Rule 1: Procedural sentences must not exceed 20 words."""
        # Compliant procedural step (6 words)
        short_step = "1. Set the transmitter power slider."
        res_short = self.linter.lint_text(short_step)
        self.assertEqual(res_short["summary"]["rule_1_violations"], 0)

        # Over-length procedural step (23 words)
        long_step = (
            "1. Set the transmitter power slider to one hundred gigawatts and observe the resulting received optical power on the live telemetry dashboard card."
        )
        res_long = self.linter.lint_text(long_step)
        self.assertEqual(res_long["status"], "FAIL")
        violations = [v for v in res_long["violations"] if v["rule"] == "RULE_1_SENTENCE_LENGTH"]
        self.assertTrue(len(violations) >= 1)
        self.assertEqual(violations[0]["limit"], 20)
        self.assertGreater(violations[0]["word_count"], 20)

    def test_passive_voice_detection_and_ceiling(self):
        """Rule 2: Detect passive voice and enforce the < 5.0% incidence ceiling."""
        # Single passive sentence (100% passive ratio -> FAILS)
        passive_text = "The optical pulse was reflected by the retroreflector."
        res_passive = self.linter.lint_text(passive_text)
        self.assertEqual(res_passive["status"], "FAIL")
        self.assertEqual(res_passive["summary"]["passive_sentences"], 1)
        self.assertGreaterEqual(res_passive["summary"]["passive_percentage"], 5.0)

        # Active rewrite
        active_text = "The retroreflector reflected the optical pulse."
        res_active = self.linter.lint_text(active_text)
        self.assertEqual(res_active["summary"]["passive_sentences"], 0)
        self.assertEqual(res_active["status"], "PASS")

        # Document with 1 passive out of 25 sentences (4% passive -> PASSES under 5% limit)
        many_active = [f"The transmitter sends pulse number {i} toward deep space." for i in range(24)]
        many_active.append("The final pulse was received by Earth collectors.")
        mixed_doc = "\n".join(many_active)
        res_mixed = self.linter.lint_text(mixed_doc)
        self.assertLess(res_mixed["summary"]["passive_percentage"], 5.0)
        self.assertEqual(res_mixed["status"], "PASS")

        # In strict mode, any passive sentence causes failure
        res_strict = self.strict_linter.lint_text(mixed_doc)
        self.assertEqual(res_strict["status"], "FAIL")

    def test_banned_ambiguous_words(self):
        """Rule 3: Prohibit banned words (since, as, could, should, may, etc.)."""
        banned_examples = [
            ("We use lasers since the velocity is high.", "since"),
            ("The frequency drops as the vehicle accelerates.", "as"),
            ("The system could reach higher speeds.", "could"),
            ("The operator should inspect the mirror.", "should"),
            ("Radiation pressure may deflect the sail.", "may"),
            ("The payload contains cameras, sensors, etc.", "etc"),
            ("The mission requires several ground stations.", "several"),
        ]

        for text, word in banned_examples:
            res = self.linter.lint_text(text)
            self.assertEqual(res["status"], "FAIL", f"Failed to flag banned word: {word}")
            found_words = [v.get("word") for v in res["violations"] if v.get("rule") == "RULE_3_BANNED_WORD"]
            self.assertIn(word, found_words, f"Expected {word} in violations for: {text}")

        # Verify allowable exemptions: 'such as' and 'as well as'
        exempt_text_1 = "The architecture uses optical components such as lenses and mirrors."
        res_exempt_1 = self.linter.lint_text(exempt_text_1)
        banned_v1 = [v for v in res_exempt_1["violations"] if v.get("rule") == "RULE_3_BANNED_WORD"]
        self.assertEqual(len(banned_v1), 0, "Exempt 'such as' was incorrectly flagged")

        exempt_text_2 = "The detector measures pulse arrival time as well as signal power."
        res_exempt_2 = self.linter.lint_text(exempt_text_2)
        banned_v2 = [v for v in res_exempt_2["violations"] if v.get("rule") == "RULE_3_BANNED_WORD"]
        self.assertEqual(len(banned_v2), 0, "Exempt 'as well as' was incorrectly flagged")

    def test_noun_cluster_detection(self):
        """Rule 5: Flag noun clusters containing more than three consecutive nouns."""
        # 4 consecutive nouns: "ground optical transceiver aperture diameter"
        cluster_text = "The ground optical transceiver aperture diameter measures ten meters."
        res_cluster = self.linter.lint_text(cluster_text)
        self.assertEqual(res_cluster["status"], "FAIL")
        cluster_v = [v for v in res_cluster["violations"] if v.get("rule") == "RULE_5_NOUN_CLUSTER"]
        self.assertGreaterEqual(len(cluster_v), 1)

        # Rewritten without noun cluster
        clean_text = "The diameter of the ground optical transceiver aperture measures ten meters."
        res_clean = self.linter.lint_text(clean_text)
        cluster_clean_v = [v for v in res_clean["violations"] if v.get("rule") == "RULE_5_NOUN_CLUSTER"]
        self.assertEqual(len(cluster_clean_v), 0)

    def test_technical_glossary_schema_and_forbidden_synonyms(self):
        """Rule 4: Verify approved 20-term glossary schema and flag forbidden synonyms."""
        # 1. Verify schema completeness (must contain at least 20 entries)
        self.assertGreaterEqual(len(APPROVED_GLOSSARY), 20)
        for term, data in APPROVED_GLOSSARY.items():
            self.assertIn("category", data, f"Missing category in {term}")
            self.assertIn("definition", data, f"Missing definition in {term}")
            self.assertIn("forbidden_synonyms", data, f"Missing forbidden_synonyms in {term}")
            self.assertTrue(len(data["definition"]) > 10)

        # 2. Test forbidden synonyms detection
        bad_synonym_text = "The spacecraft carries a trihedral reflector to bounce light."
        res = self.linter.lint_text(bad_synonym_text)
        self.assertEqual(res["status"], "FAIL")
        synonym_v = [v for v in res["violations"] if v.get("rule") == "RULE_4_FORBIDDEN_SYNONYM"]
        self.assertGreaterEqual(len(synonym_v), 1)
        self.assertEqual(synonym_v[0]["term"], "Corner-Cube Reflector")
        self.assertEqual(synonym_v[0]["forbidden_synonym"], "trihedral reflector")

    def test_math_and_code_shielding(self):
        """Verify that LaTeX math and code blocks are shielded and do not corrupt word counts."""
        # Inline math: embedded formula '$E = mc^2$' counts as exactly 1 word
        math_sentence = "The equation $E = mc^2$ governs relativistic kinetic energy."
        tokens = self.linter.stage4_tokenize(self.linter.stage1_sanitize(math_sentence))
        # "The", "equation", "[MATH_INLINE]", "governs", "relativistic", "kinetic", "energy" -> 7 words
        self.assertEqual(len(tokens), 7)

        # Display equation and code block should not count as descriptive sentences
        doc_with_blocks = (
            "The engineer computes the metric.\n\n"
            "$$\n"
            "ds^2 = -c^2 dt^2 + dx^2\n"
            "$$\n\n"
            "```python\n"
            "def test():\n"
            "    pass\n"
            "```\n\n"
            "The calculation confirms flat spacetime.\n"
        )
        res = self.linter.lint_text(doc_with_blocks)
        self.assertEqual(res["status"], "PASS")
        self.assertEqual(res["summary"]["descriptive_sentences"], 2)


if __name__ == "__main__":
    unittest.main()
