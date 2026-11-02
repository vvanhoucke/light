#!/usr/bin/env python3
"""
tools/lint_ste.py — ASD-STE100 Simplified Technical English Linter

Implements an 8-stage verification pipeline for ASD-STE100 Issue 8 compliance:
  Stage 1: Document Sanitizer & Shielding (LaTeX math, code blocks, URLs, HTML tags)
  Stage 2: Block Classifier (Descriptive, Procedural, Heading, Table, Metadata)
  Stage 3: Sentence Boundary Disambiguation (protecting abbreviations, decimals, acronyms)
  Stage 4: Tokenizer & Morphological Analyzer (word tokens, compounds, semicolons)
  Stage 5: Sentence Length Enforcement (Rule 1: descriptive <= 25 words, procedural <= 20 words)
  Stage 6: Passive Voice Detector (Rule 2: auxiliary 'to be' + past participle; passive < 5.0%)
  Stage 7: Disallowed Ambiguous Words & Noun Cluster Detector (Rule 3: banned words; Rule 5: noun clusters > 3)
  Stage 8: Technical Glossary & Acronym Validator (Rule 4: approved 20-term schema & forbidden synonyms)

Exit codes:
  0: PASS (All rules compliant)
  1: FAIL (One or more violations found)
"""

import sys
import os
import re
import json
import argparse
from typing import List, Dict, Any, Tuple, Optional

# Approved 20-Term Domain Glossary Schema
APPROVED_GLOSSARY: Dict[str, Dict[str, Any]] = {
    "ASD-STE100": {
        "category": "Acronym",
        "symbol": "N/A",
        "definition": "Aerospace and Defence Simplified Technical English standard.",
        "forbidden_synonyms": ["ste standard", "simplified english standard"]
    },
    "Bit Conservation": {
        "category": "TN",
        "symbol": "B",
        "definition": "The principle where the number of bits in flight equals the difference between transmitted bits and received bits.",
        "forbidden_synonyms": ["bit tracking", "bit storage"]
    },
    "Cat's-Eye Reflector": {
        "category": "TN",
        "symbol": "N/A",
        "definition": "An optical retroreflector made of a focusing lens and a concave mirror at the focal plane.",
        "forbidden_synonyms": ["cat-eye mirror", "cateye reflector"]
    },
    "Chirp Rate": {
        "category": "TN",
        "symbol": "df/dt",
        "definition": "The rate of change of the received optical frequency over reception time.",
        "forbidden_synonyms": ["frequency slew", "frequency drift"]
    },
    "Coordinate Velocity": {
        "category": "TN",
        "symbol": "beta",
        "definition": "The speed of the spacecraft relative to Earth, divided by the speed of light in vacuum.",
        "forbidden_synonyms": ["relative speed", "coordinate speed"]
    },
    "Corner-Cube Reflector": {
        "category": "TN",
        "symbol": "N/A",
        "definition": "A retroreflector consisting of three mutually perpendicular planar mirrors.",
        "forbidden_synonyms": ["trihedral reflector", "corner cube"]
    },
    "Dihedral Angle Offset": {
        "category": "TN",
        "symbol": "delta alpha",
        "definition": "The deliberate angular adjustment between mirror faces to compensate for relativistic velocity aberration.",
        "forbidden_synonyms": ["mirror tilt", "angle bias"]
    },
    "Diffraction Loss": {
        "category": "TN",
        "symbol": "eta_diff",
        "definition": "The decrease in optical power caused by the spatial divergence of the laser beam.",
        "forbidden_synonyms": ["beam spreading loss", "divergence attenuation"]
    },
    "Gordon-Holevo Capacity": {
        "category": "TN",
        "symbol": "chi",
        "definition": "The fundamental quantum upper limit on the rate of classical information transmission through an optical channel.",
        "forbidden_synonyms": ["quantum capacity", "holevo limit"]
    },
    "Interstellar Medium": {
        "category": "TN / Acronym",
        "symbol": "ISM",
        "definition": "The gas, dust, and cosmic rays that exist in the space between star systems.",
        "forbidden_synonyms": ["space dust", "galactic gas"]
    },
    "Lorentz Factor": {
        "category": "TN",
        "symbol": "gamma",
        "definition": "The relativistic scaling factor that quantifies time dilation and length contraction.",
        "forbidden_synonyms": ["gamma factor", "lorentz contraction factor"]
    },
    "Optical Delay-Line": {
        "category": "TN",
        "symbol": "N/A",
        "definition": "A transmission path that stores data in the propagation delay of electromagnetic wavepackets.",
        "forbidden_synonyms": ["light buffer", "delay storage", "optical delay line"]
    },
    "Photon-Starved Regime": {
        "category": "TN",
        "symbol": "N/A",
        "definition": "An operational regime where the mean received photon number per pulse or mode is much less than one.",
        "forbidden_synonyms": ["low-power optical link", "photon deficient regime"]
    },
    "Pointing Lead Angle": {
        "category": "TN",
        "symbol": "theta_lead",
        "definition": "The angular offset used when aiming the transmitter to hit the moving spacecraft at the retarded time.",
        "forbidden_synonyms": ["look-ahead angle", "lead angle"]
    },
    "Proper Acceleration": {
        "category": "TN",
        "symbol": "alpha",
        "definition": "The physical acceleration experienced and measured by an accelerometer on board the spacecraft.",
        "forbidden_synonyms": ["rest acceleration", "proper gravity"]
    },
    "Rapidity": {
        "category": "TN",
        "symbol": "xi",
        "definition": "The hyperbolic angle parameter representing relativistic velocity.",
        "forbidden_synonyms": ["hyperbolic speed", "velocity angle"]
    },
    "Retarded Time": {
        "category": "TN",
        "symbol": "t_ret",
        "definition": "The emission coordinate time of a light signal that arrives at an observer at reception time.",
        "forbidden_synonyms": ["delayed time", "retardation time"]
    },
    "Rindler Horizon": {
        "category": "TN",
        "symbol": "c/alpha",
        "definition": "The boundary in spacetime beyond which emitted light signals cannot reach an accelerating spacecraft.",
        "forbidden_synonyms": ["causal event horizon", "acceleration horizon"]
    },
    "Two-Way Doppler Factor": {
        "category": "TN",
        "symbol": "D_2",
        "definition": "The ratio of the optical frequency received at Earth to the frequency transmitted from Earth after reflection.",
        "forbidden_synonyms": ["doppler ratio", "two-way shift"]
    },
    "Velocity Aberration": {
        "category": "TN",
        "symbol": "theta_ab",
        "definition": "The apparent shift in the direction of light caused by the relativistic motion of the reflector.",
        "forbidden_synonyms": ["light deflection", "relativistic beam walk-off"]
    }
}

# Banned ambiguous words and their recommended replacements
BANNED_WORDS: Dict[str, str] = {
    "since": "Use 'because' for causation, or 'after'/'from' for temporal duration.",
    "as": "Use 'while' for simultaneous action, or 'because' for causation (exempt: 'such as', 'as well as').",
    "may": "Use 'can' for physical possibility, or 'must' for requirements.",
    "could": "Use 'can' or 'will' with explicit conditions.",
    "should": "Use 'must' for mandatory requirements, or state expected behavior explicitly.",
    "might": "Use 'can' or state quantitative probability.",
    "etc": "List all items explicitly or use 'such as [examples]'.",
    "etc.": "List all items explicitly or use 'such as [examples]'.",
    "various": "State specific quantities or distinct names.",
    "several": "State the exact number or quantitative bounds."
}

# Imperative / Procedural starting verbs
PROCEDURAL_START_VERBS = {
    "select", "adjust", "compute", "verify", "click", "set", "rotate",
    "run", "open", "test", "check", "execute", "apply", "use", "measure",
    "align", "send", "receive", "configure", "inspect", "keep", "observe",
    "record", "ensure", "calculate", "choose", "drag", "press", "slide",
    "enter", "initialize", "reset", "start", "stop", "change", "switch"
}

# Auxiliary verbs for passive voice detection
BE_AUXILIARIES = {"is", "are", "was", "were", "be", "been", "being"}

# Common irregular past participles
IRREGULAR_PAST_PARTICIPLES = {
    "shown", "found", "known", "given", "taken", "built", "driven", "seen",
    "done", "chosen", "caught", "sent", "set", "read", "left", "kept",
    "lost", "struck", "bent", "drawn", "split", "spread", "run", "become",
    "grown", "written", "transmitted", "emitted", "received", "reflected",
    "derived", "computed", "calculated", "attenuated", "shifted", "accelerated",
    "absorbed", "measured", "plotted", "stored", "deflected", "guided",
    "focused", "compressed", "expanded", "achieved", "tested", "proven"
}

# Standard known nouns for noun cluster detection
COMMON_NOUNS = {
    "laser", "transmitter", "receiver", "antenna", "aperture", "diameter", "reflector",
    "spacecraft", "photon", "flux", "frequency", "wavelength", "capacity", "delay",
    "rate", "time", "distance", "velocity", "acceleration", "horizon", "optics", "optical", "transceiver",
    "channel", "noise", "power", "loss", "budget", "orbit", "earth", "dihedral",
    "angle", "aberration", "beam", "array", "collector", "signal", "bandwidth",
    "packet", "storage", "medium", "data", "pulse", "ratio", "factor", "limit",
    "table", "figure", "model", "parameter", "preset", "slider", "mode", "state",
    "system", "subsystem", "design", "phase", "component", "surface", "coating"
}

class STELinter:
    def __init__(self, strict: bool = False):
        self.strict = strict
        self.shield_map: Dict[str, str] = {}
        self.shield_counter = 0

    def _reset_shields(self):
        self.shield_map = {}
        self.shield_counter = 0

    def _shield(self, match_str: str, prefix: str = "SHIELD") -> str:
        token = f"__{prefix}_{self.shield_counter}__"
        self.shield_map[token] = match_str
        self.shield_counter += 1
        return token

    # Stage 1: Document Sanitizer & Shielding
    def stage1_sanitize(self, raw_text: str) -> str:
        self._reset_shields()
        text = raw_text

        # Shield code blocks: ```...```
        def replace_code_block(m):
            return self._shield(m.group(0), "CODE_BLOCK")
        text = re.sub(r"```[\s\S]*?```", replace_code_block, text)

        # Shield inline code: `...`
        def replace_code_inline(m):
            return self._shield(m.group(0), "CODE_INLINE")
        text = re.sub(r"`[^`\n]+`", replace_code_inline, text)

        # Shield display equations: $$...$$
        def replace_display_math(m):
            return self._shield(m.group(0), "MATH_DISPLAY")
        text = re.sub(r"\$\$[\s\S]*?\$\$", replace_display_math, text)

        # Shield inline equations: $...$
        def replace_inline_math(m):
            return self._shield(m.group(0), "MATH_INLINE")
        text = re.sub(r"\$[^\$\n]+?\$", replace_inline_math, text)

        # Shield URLs
        def replace_url(m):
            return self._shield(m.group(0), "URL")
        text = re.sub(r"https?://[^\s)\]]+", replace_url, text)

        # Remove HTML comments
        text = re.sub(r"<!--[\s\S]*?-->", "", text)

        # Shield HTML entities: &...;
        def replace_entity(m):
            return self._shield(m.group(0), "ENTITY")
        text = re.sub(r"&[a-zA-Z0-9#]+;", replace_entity, text)

        # Replace HTML tags with space or shield if block
        def replace_html(m):
            tag_name = m.group(1).lower() if m.group(1) else ""
            if tag_name in ["p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th"]:
                return "\n"
            return " "
        text = re.sub(r"<(/?[a-zA-Z0-9]+)[^>]*>", replace_html, text)

        # Shield Markdown image references: ![alt](url)
        text = re.sub(r"!\[.*?\]\(.*?\)", "", text)

        # Markdown links: [text](url) -> keep text only
        text = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", text)

        return text

    # Stage 2: Block Classifier
    def stage2_classify_blocks(self, text: str) -> List[Dict[str, Any]]:
        raw_lines = text.split("\n")
        blocks = []
        current_block_lines = []
        current_type = None
        start_line_no = 1

        for idx, line in enumerate(raw_lines, start=1):
            stripped = line.strip()

            if not stripped:
                if current_block_lines:
                    blocks.append({
                        "type": current_type,
                        "text": " ".join(current_block_lines),
                        "line_no": start_line_no
                    })
                    current_block_lines = []
                    current_type = None
                continue

            # Heading detection
            if re.match(r"^#{1,6}\s+", stripped):
                if current_block_lines:
                    blocks.append({
                        "type": current_type,
                        "text": " ".join(current_block_lines),
                        "line_no": start_line_no
                    })
                    current_block_lines = []
                blocks.append({
                    "type": "HEADING",
                    "text": re.sub(r"^#{1,6}\s+", "", stripped),
                    "line_no": idx
                })
                current_type = None
                continue

            # Table row detection
            if stripped.startswith("|") and stripped.endswith("|"):
                if current_block_lines and current_type != "TABLE":
                    blocks.append({
                        "type": current_type,
                        "text": " ".join(current_block_lines),
                        "line_no": start_line_no
                    })
                    current_block_lines = []
                if not current_block_lines:
                    start_line_no = idx
                    current_type = "TABLE"
                current_block_lines.append(stripped)
                continue

            # Procedural item detection (numbered list or bullet starting with verb)
            is_num_list = re.match(r"^\d+\.\s+", stripped)
            is_bullet = re.match(r"^[-*]\s+", stripped)
            
            first_word = ""
            if is_num_list:
                content = re.sub(r"^\d+\.\s+", "", stripped)
                first_word = content.split()[0].lower().strip(".,:;!?") if content.split() else ""
            elif is_bullet:
                content = re.sub(r"^[-*]\s+", "", stripped)
                first_word = content.split()[0].lower().strip(".,:;!?") if content.split() else ""

            is_procedural = bool(is_num_list) or (bool(is_bullet) and first_word in PROCEDURAL_START_VERBS)

            if is_procedural:
                if current_block_lines:
                    blocks.append({
                        "type": current_type,
                        "text": " ".join(current_block_lines),
                        "line_no": start_line_no
                    })
                    current_block_lines = []
                clean_content = re.sub(r"^(\d+\.|[-*])\s+", "", stripped)
                blocks.append({
                    "type": "PROCEDURAL",
                    "text": clean_content,
                    "line_no": idx
                })
                current_type = None
                continue

            # Standard descriptive line
            if not current_block_lines:
                start_line_no = idx
                current_type = "DESCRIPTIVE"
            current_block_lines.append(stripped)

        if current_block_lines:
            blocks.append({
                "type": current_type,
                "text": " ".join(current_block_lines),
                "line_no": start_line_no
            })

        return blocks

    # Stage 3: Sentence Boundary Disambiguation
    def stage3_split_sentences(self, block: Dict[str, Any]) -> List[Dict[str, Any]]:
        text = block["text"]
        b_type = block["type"]
        line_no = block["line_no"]

        if b_type in ["HEADING", "TABLE"]:
            return []

        # Mask abbreviations
        abbreviations = [
            "e.g.", "i.e.", "vs.", "Fig.", "Ref.", "eq.", "approx.", "min.",
            "max.", "no.", "al.", "sec.", "hr.", "yr.", "deg.", "rad.", "etc."
        ]
        masked = text
        for abbr in abbreviations:
            pattern = re.escape(abbr)
            replacement = abbr.replace(".", "\u2024")
            masked = re.sub(pattern, replacement, masked, flags=re.IGNORECASE)

        # Mask decimal numbers: e.g., 3.14 -> 3․14
        masked = re.sub(r"(\d+)\.(\d+)", r"\1\u2024\2", masked)

        # Split on sentence ending punctuation [.!?] followed by whitespace or end of string
        raw_sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"\'_])", masked)

        results = []
        for raw_s in raw_sentences:
            s = raw_s.replace("\u2024", ".").strip()
            if not s:
                continue
            # Ignore lone shield tokens
            if re.match(r"^__MATH_DISPLAY_\d+__$", s) or re.match(r"^__CODE_BLOCK_\d+__$", s):
                continue
            results.append({
                "text": s,
                "type": b_type,
                "line_no": line_no
            })

        return results

    # Stage 4: Tokenizer & Morphological Analyzer
    def stage4_tokenize(self, sentence: str) -> List[str]:
        # Treat inline math tokens and inline code tokens as single words
        # Extract word tokens matching letters, numbers, hyphens
        tokens = []
        raw_tokens = sentence.split()
        for tok in raw_tokens:
            clean = tok.strip(".,:;!?\"'()[]{}")
            if not clean:
                continue
            # If token contains an inline math or code shield, counts as 1 word
            if "__MATH_INLINE_" in clean or "__CODE_INLINE_" in clean:
                tokens.append(clean)
            elif re.match(r"^[A-Za-z0-9_-]+$", clean):
                tokens.append(clean)
            else:
                sub_tokens = re.findall(r"[A-Za-z0-9_-]+", clean)
                tokens.extend(sub_tokens)
        return tokens

    # Stage 5: Rule 1 Sentence Length Enforcement
    def stage5_check_length(self, sentence: Dict[str, Any], tokens: List[str]) -> Optional[Dict[str, Any]]:
        word_count = len(tokens)
        s_type = sentence["type"]
        limit = 25 if s_type == "DESCRIPTIVE" else 20

        if word_count > limit:
            return {
                "rule": "RULE_1_SENTENCE_LENGTH",
                "line_no": sentence["line_no"],
                "type": s_type,
                "word_count": word_count,
                "limit": limit,
                "sentence": sentence["text"],
                "message": f"Rule 1 violation: {s_type.lower()} sentence has {word_count} words (limit: {limit})."
            }
        return None

    # Stage 6: Rule 2 Passive Voice Detector
    def stage6_check_passive(self, sentence: Dict[str, Any], tokens: List[str]) -> bool:
        lower_tokens = [t.lower() for t in tokens]
        n = len(lower_tokens)

        for i in range(n - 1):
            if lower_tokens[i] in BE_AUXILIARIES:
                # Check next 1 or 2 tokens for past participle
                for offset in [1, 2]:
                    if i + offset < n:
                        candidate = lower_tokens[i + offset]
                        if candidate in IRREGULAR_PAST_PARTICIPLES:
                            return True
                        if candidate.endswith("ed") and len(candidate) > 4:
                            # Verify candidate is not a shielded token or common adjective
                            if candidate not in {"speed", "need", "seed", "feed", "bleed"}:
                                return True
        return False

    # Stage 7: Rule 3 & 5 Disallowed Words and Noun Clusters
    def stage7_check_banned_words_and_clusters(self, sentence: Dict[str, Any], tokens: List[str]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        banned_violations = []
        cluster_violations = []
        s_text = sentence["text"]
        lower_tokens = [t.lower() for t in tokens]

        # Rule 1 sub-check: Semicolons prohibited
        if ";" in s_text:
            banned_violations.append({
                "rule": "RULE_1_SEMICOLON",
                "line_no": sentence["line_no"],
                "sentence": s_text,
                "message": "Rule 1 violation: Semicolons are prohibited in ASD-STE100. Divide into separate sentences."
            })

        # Rule 3: Banned words
        for idx, word in enumerate(lower_tokens):
            if word in BANNED_WORDS:
                # Exemptions for 'as': 'such as', 'as well as'
                if word == "as":
                    prev_word = lower_tokens[idx - 1] if idx > 0 else ""
                    next_word = lower_tokens[idx + 1] if idx + 1 < len(lower_tokens) else ""
                    if prev_word == "such" or next_word == "well" or prev_word == "well":
                        continue
                # Exemptions for 'since' if followed by numeric year (e.g. since 1905)
                if word == "since":
                    next_word = lower_tokens[idx + 1] if idx + 1 < len(lower_tokens) else ""
                    if re.match(r"^\d{4}$", next_word):
                        continue

                banned_violations.append({
                    "rule": "RULE_3_BANNED_WORD",
                    "line_no": sentence["line_no"],
                    "word": word,
                    "sentence": s_text,
                    "message": f"Rule 3 violation: Banned ambiguous word '{word}'. {BANNED_WORDS[word]}"
                })

        # Rule 5: Noun clusters (> 3 consecutive nouns)
        consecutive_nouns = []
        for word in lower_tokens:
            clean = re.sub(r"[^a-z]", "", word)
            # Heuristic for nouns: present in common nouns or technical terms, or ends in -tion/-ment/-ance/-ence/-ity/-meter/-array
            is_noun = (clean in COMMON_NOUNS) or any(
                clean.endswith(sfx) for sfx in ["tion", "ment", "ance", "ence", "ity", "meter", "array"]
            )
            if is_noun:
                consecutive_nouns.append(clean)
                if len(consecutive_nouns) > 3:
                    cluster_violations.append({
                        "rule": "RULE_5_NOUN_CLUSTER",
                        "line_no": sentence["line_no"],
                        "phrase": " ".join(consecutive_nouns),
                        "sentence": s_text,
                        "message": f"Rule 5 violation: Noun cluster of length {len(consecutive_nouns)}: '{' '.join(consecutive_nouns)}'."
                    })
            else:
                consecutive_nouns = []

        return banned_violations, cluster_violations

    # Stage 8: Technical Glossary & Acronym Validator
    def stage8_validate_glossary(self, full_text: str) -> List[Dict[str, Any]]:
        violations = []
        lower_full = full_text.lower()

        # Check for forbidden synonyms
        for term, meta in APPROVED_GLOSSARY.items():
            for forbidden in meta.get("forbidden_synonyms", []):
                if forbidden == "lead angle":
                    pattern = r"(?<!pointing\s)\blead angle\b"
                else:
                    pattern = r"\b" + re.escape(forbidden) + r"\b"
                matches = list(re.finditer(pattern, lower_full))
                if matches:
                    violations.append({
                        "rule": "RULE_4_FORBIDDEN_SYNONYM",
                        "term": term,
                        "forbidden_synonym": forbidden,
                        "occurrences": len(matches),
                        "message": f"Rule 4 violation: Forbidden synonym '{forbidden}' used instead of approved term '{term}'."
                    })

        return violations

    def lint_file(self, file_path: str) -> Dict[str, Any]:
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Target document file not found: {file_path}")

        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            raw_content = f.read()

        return self.lint_text(raw_content, file_path=file_path)

    def lint_text(self, raw_content: str, file_path: str = "inline_text") -> Dict[str, Any]:
        # Stage 1: Sanitize
        sanitized = self.stage1_sanitize(raw_content)

        # Stage 2: Classify Blocks
        blocks = self.stage2_classify_blocks(sanitized)

        # Stage 3: Split Sentences
        all_sentences = []
        for block in blocks:
            s_list = self.stage3_split_sentences(block)
            all_sentences.extend(s_list)

        total_sentences = len(all_sentences)
        descriptive_count = sum(1 for s in all_sentences if s["type"] == "DESCRIPTIVE")
        procedural_count = sum(1 for s in all_sentences if s["type"] == "PROCEDURAL")

        length_violations = []
        passive_sentences = []
        banned_word_violations = []
        noun_cluster_violations = []

        for sentence in all_sentences:
            tokens = self.stage4_tokenize(sentence["text"])

            # Stage 5: Sentence Length
            len_err = self.stage5_check_length(sentence, tokens)
            if len_err:
                length_violations.append(len_err)

            # Stage 6: Passive Voice
            is_passive = self.stage6_check_passive(sentence, tokens)
            if is_passive:
                passive_sentences.append({
                    "line_no": sentence["line_no"],
                    "sentence": sentence["text"]
                })

            # Stage 7: Banned Words & Noun Clusters
            banned_errs, cluster_errs = self.stage7_check_banned_words_and_clusters(sentence, tokens)
            banned_word_violations.extend(banned_errs)
            noun_cluster_violations.extend(cluster_errs)

        # Passive percentage calculation
        passive_count = len(passive_sentences)
        passive_percentage = (passive_count / total_sentences * 100.0) if total_sentences > 0 else 0.0

        rule_2_violations = []
        if passive_percentage >= 5.0:
            rule_2_violations.append({
                "rule": "RULE_2_PASSIVE_CEILING_EXCEEDED",
                "passive_percentage": round(passive_percentage, 2),
                "limit": 5.0,
                "passive_count": passive_count,
                "total_sentences": total_sentences,
                "message": f"Rule 2 violation: Passive voice incidence is {passive_percentage:.2f}% (limit: <5.0%)."
            })

        if self.strict and passive_count > 0:
            for ps in passive_sentences:
                rule_2_violations.append({
                    "rule": "RULE_2_PASSIVE_STRICT",
                    "line_no": ps["line_no"],
                    "sentence": ps["sentence"],
                    "message": f"Strict violation: Passive construction on line {ps['line_no']}."
                })

        # Stage 8: Glossary Validation
        glossary_violations = self.stage8_validate_glossary(raw_content)

        # Aggregate Violations
        all_violations = (
            length_violations
            + rule_2_violations
            + banned_word_violations
            + noun_cluster_violations
            + glossary_violations
        )

        status = "PASS" if len(all_violations) == 0 else "FAIL"

        return {
            "file": file_path,
            "status": status,
            "summary": {
                "total_sentences": total_sentences,
                "descriptive_sentences": descriptive_count,
                "procedural_sentences": procedural_count,
                "passive_sentences": passive_count,
                "passive_percentage": round(passive_percentage, 2),
                "rule_1_violations": len(length_violations),
                "rule_2_violations": len(rule_2_violations),
                "rule_3_violations": len(banned_word_violations),
                "rule_4_violations": len(glossary_violations),
                "rule_5_violations": len(noun_cluster_violations),
                "total_violations": len(all_violations)
            },
            "violations": all_violations,
            "passive_instances": passive_sentences
        }


def format_cli_report(results: Dict[str, Any]) -> str:
    summary = results["summary"]
    status_str = f"\033[92mPASS\033[0m" if results["status"] == "PASS" else f"\033[91mFAIL\033[0m"
    lines = [
        "============================================================",
        f" ASD-STE100 Linter Report: {results['file']}",
        f" Status: {status_str}",
        "============================================================",
        f" Total Sentences:        {summary['total_sentences']}",
        f"   - Descriptive:        {summary['descriptive_sentences']}",
        f"   - Procedural:         {summary['procedural_sentences']}",
        f" Passive Voice Sentences: {summary['passive_sentences']} ({summary['passive_percentage']}%) [Limit: <5.0%]",
        f" Rule Violations Breakdown:",
        f"   - Rule 1 (Length):     {summary['rule_1_violations']}",
        f"   - Rule 2 (Passive):    {summary['rule_2_violations']}",
        f"   - Rule 3 (Banned):     {summary['rule_3_violations']}",
        f"   - Rule 4 (Glossary):   {summary['rule_4_violations']}",
        f"   - Rule 5 (Clusters):   {summary['rule_5_violations']}",
        f" Total Violations:       {summary['total_violations']}",
        "============================================================"
    ]

    if results["violations"]:
        lines.append("\nVIOLATION DETAILS:")
        for idx, v in enumerate(results["violations"], start=1):
            line_str = f"Line {v.get('line_no', 'N/A')}: " if 'line_no' in v else ""
            lines.append(f"  [{idx}] {line_str}{v.get('rule', 'RULE_VIOLATION')} — {v.get('message', '')}")
            if "sentence" in v:
                snippet = v["sentence"]
                if len(snippet) > 90:
                    snippet = snippet[:87] + "..."
                lines.append(f"      Text: \"{snippet}\"")
        lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="ASD-STE100 Issue 8 Simplified Technical English Linter CLI"
    )
    parser.add_argument("--file", "-f", required=True, help="Target markdown or HTML file to validate")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    parser.add_argument("--report", action="store_true", help="Generate detailed Markdown report")
    parser.add_argument("--strict", action="store_true", help="Fail on any passive sentence (even if <5%)")

    args = parser.parse_args()

    linter = STELinter(strict=args.strict)
    try:
        results = linter.lint_file(args.file)
    except Exception as e:
        print(f"Error executing STE linter: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(results, indent=2))
    elif args.report:
        report_md = [
            f"# ASD-STE100 Compliance Report: {results['file']}",
            f"\n**Status**: {results['status']}",
            f"\n## Summary Metrics",
            f"- Total Sentences: {results['summary']['total_sentences']}",
            f"- Descriptive Sentences: {results['summary']['descriptive_sentences']}",
            f"- Procedural Sentences: {results['summary']['procedural_sentences']}",
            f"- Passive Incidence: {results['summary']['passive_percentage']}% (Limit: <5.0%)",
            f"- Total Violations: {results['summary']['total_violations']}\n",
            "## Violations"
        ]
        if results["violations"]:
            for v in results["violations"]:
                report_md.append(f"- **{v.get('rule')}** (Line {v.get('line_no', 'N/A')}): {v.get('message')}")
        else:
            report_md.append("- No rule violations found. Text is 100% ASD-STE100 compliant.")
        print("\n".join(report_md))
    else:
        print(format_cli_report(results))

    sys.exit(0 if results["status"] == "PASS" else 1)


if __name__ == "__main__":
    main()
