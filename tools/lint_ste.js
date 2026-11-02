// tools/lint_ste.js
// JavaScriptCore port of tools/lint_ste.py
// Validates ASD-STE100 compliance across 8 stages.

const APPROVED_GLOSSARY = {
  "ASD-STE100": {
    category: "Acronym",
    symbol: "N/A",
    definition: "Aerospace and Defence Simplified Technical English standard.",
    forbidden_synonyms: ["ste standard", "simplified english standard"]
  },
  "Bit Conservation": {
    category: "TN",
    symbol: "B",
    definition: "The principle where the number of bits in flight equals the difference between transmitted bits and received bits.",
    forbidden_synonyms: ["bit tracking", "bit storage"]
  },
  "Cat's-Eye Reflector": {
    category: "TN",
    symbol: "N/A",
    definition: "An optical retroreflector made of a focusing lens and a concave mirror at the focal plane.",
    forbidden_synonyms: ["cat-eye mirror", "cateye reflector"]
  },
  "Chirp Rate": {
    category: "TN",
    symbol: "df/dt",
    definition: "The rate of change of the received optical frequency over reception time.",
    forbidden_synonyms: ["frequency slew", "frequency drift"]
  },
  "Coordinate Velocity": {
    category: "TN",
    symbol: "beta",
    definition: "The speed of the spacecraft relative to Earth, divided by the speed of light in vacuum.",
    forbidden_synonyms: ["relative speed", "coordinate speed"]
  },
  "Corner-Cube Reflector": {
    category: "TN",
    symbol: "N/A",
    definition: "A retroreflector consisting of three mutually perpendicular planar mirrors.",
    forbidden_synonyms: ["trihedral reflector", "corner cube"]
  },
  "Dihedral Angle Offset": {
    category: "TN",
    symbol: "delta alpha",
    definition: "The deliberate angular adjustment between mirror faces to compensate for relativistic velocity aberration.",
    forbidden_synonyms: ["mirror tilt", "angle bias"]
  },
  "Diffraction Loss": {
    category: "TN",
    symbol: "eta_diff",
    definition: "The decrease in optical power caused by the spatial divergence of the laser beam.",
    forbidden_synonyms: ["beam spreading loss", "divergence attenuation"]
  },
  "Gordon-Holevo Capacity": {
    category: "TN",
    symbol: "chi",
    definition: "The fundamental quantum upper limit on the rate of classical information transmission through an optical channel.",
    forbidden_synonyms: ["quantum capacity", "holevo limit"]
  },
  "Interstellar Medium": {
    category: "TN / Acronym",
    symbol: "ISM",
    definition: "The gas, dust, and cosmic rays that exist in the space between star systems.",
    forbidden_synonyms: ["space dust", "galactic gas"]
  },
  "Lorentz Factor": {
    category: "TN",
    symbol: "gamma",
    definition: "The relativistic scaling factor that quantifies time dilation and length contraction.",
    forbidden_synonyms: ["gamma factor", "lorentz contraction factor"]
  },
  "Optical Delay-Line": {
    category: "TN",
    symbol: "N/A",
    definition: "A transmission path that stores data in the propagation delay of electromagnetic wavepackets.",
    forbidden_synonyms: ["light buffer", "delay storage", "optical delay line"]
  },
  "Photon-Starved Regime": {
    category: "TN",
    symbol: "N/A",
    definition: "An operational regime where the mean received photon number per pulse or mode is much less than one.",
    forbidden_synonyms: ["low-power optical link", "photon deficient regime"]
  },
  "Pointing Lead Angle": {
    category: "TN",
    symbol: "theta_lead",
    definition: "The angular offset used when aiming the transmitter to hit the moving spacecraft at the retarded time.",
    forbidden_synonyms: ["look-ahead angle", "lead angle"]
  },
  "Proper Acceleration": {
    category: "TN",
    symbol: "alpha",
    definition: "The physical acceleration experienced and measured by an accelerometer on board the spacecraft.",
    forbidden_synonyms: ["rest acceleration", "proper gravity"]
  },
  "Rapidity": {
    category: "TN",
    symbol: "xi",
    definition: "The hyperbolic angle parameter representing relativistic velocity.",
    forbidden_synonyms: ["hyperbolic speed", "velocity angle"]
  },
  "Retarded Time": {
    category: "TN",
    symbol: "t_ret",
    definition: "The emission coordinate time of a light signal that arrives at an observer at reception time.",
    forbidden_synonyms: ["delayed time", "retardation time"]
  },
  "Rindler Horizon": {
    category: "TN",
    symbol: "c/alpha",
    definition: "The boundary in spacetime beyond which emitted light signals cannot reach an accelerating spacecraft.",
    forbidden_synonyms: ["causal event horizon", "acceleration horizon"]
  },
  "Two-Way Doppler Factor": {
    category: "TN",
    symbol: "D_2",
    definition: "The ratio of the optical frequency received at Earth to the frequency transmitted from Earth after reflection.",
    forbidden_synonyms: ["doppler ratio", "two-way shift"]
  },
  "Velocity Aberration": {
    category: "TN",
    symbol: "theta_ab",
    definition: "The apparent shift in the direction of light caused by the relativistic motion of the reflector.",
    forbidden_synonyms: ["light deflection", "relativistic beam walk-off"]
  }
};

const BANNED_WORDS = {
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
};

const PROCEDURAL_START_VERBS = new Set([
  "select", "adjust", "compute", "verify", "click", "set", "rotate",
  "run", "open", "test", "check", "execute", "apply", "use", "measure",
  "align", "send", "receive", "configure", "inspect", "keep", "observe",
  "record", "ensure", "calculate", "choose", "drag", "press", "slide",
  "enter", "initialize", "reset", "start", "stop", "change", "switch"
]);

const BE_AUXILIARIES = new Set(["is", "are", "was", "were", "be", "been", "being"]);

const IRREGULAR_PAST_PARTICIPLES = new Set([
  "shown", "found", "known", "given", "taken", "built", "driven", "seen",
  "done", "chosen", "caught", "sent", "set", "read", "left", "kept",
  "lost", "struck", "bent", "drawn", "split", "spread", "run", "become",
  "grown", "written", "transmitted", "emitted", "received", "reflected",
  "derived", "computed", "calculated", "attenuated", "shifted", "accelerated",
  "absorbed", "measured", "plotted", "stored", "deflected", "guided",
  "focused", "compressed", "expanded", "achieved", "tested", "proven"
]);

const COMMON_NOUNS = new Set([
  "laser", "transmitter", "receiver", "antenna", "aperture", "diameter", "reflector",
  "spacecraft", "photon", "flux", "frequency", "wavelength", "capacity", "delay",
  "rate", "time", "distance", "velocity", "acceleration", "horizon", "optics", "optical", "transceiver",
  "channel", "noise", "power", "loss", "budget", "orbit", "earth", "dihedral",
  "angle", "aberration", "beam", "array", "collector", "signal", "bandwidth",
  "packet", "storage", "medium", "data", "pulse", "ratio", "factor", "limit",
  "table", "figure", "model", "parameter", "preset", "slider", "mode", "state",
  "system", "subsystem", "design", "phase", "component", "surface", "coating"
]);

function lintText(rawText, filePath = "inline") {
  let shieldCounter = 0;
  const shieldMap = {};

  function shield(str, prefix) {
    const token = `__${prefix}_${shieldCounter++}__`;
    shieldMap[token] = str;
    return token;
  }

  // Stage 1: Sanitize
  let text = rawText;
  text = text.replace(/```[\s\S]*?```/g, m => shield(m, "CODE_BLOCK"));
  text = text.replace(/`[^`\n]+`/g, m => shield(m, "CODE_INLINE"));
  text = text.replace(/\$\$[\s\S]*?\$\$/g, m => shield(m, "MATH_DISPLAY"));
  text = text.replace(/\$[^\$\n]+?\$/g, m => shield(m, "MATH_INLINE"));
  text = text.replace(/\\\[[\s\S]*?\\\]/g, m => shield(m, "MATH_DISPLAY"));
  text = text.replace(/\\\([^\n]+?\\\)/g, m => shield(m, "MATH_INLINE"));
  text = text.replace(/https?:\/\/[^\s)\]]+/g, m => shield(m, "URL"));
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/&[a-zA-Z0-9#]+;/g, m => shield(m, "ENTITY"));

  text = text.replace(/<(\/?[a-zA-Z0-9]+)[^>]*>/g, (m, tag) => {
    const t = tag.toLowerCase().replace('/', '');
    if (["p", "div", "section", "article", "header", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th"].includes(t)) {
      return "\n";
    }
    return " ";
  });
  text = text.replace(/!\[.*?\]\(.*?\)/g, "");
  text = text.replace(/\[(.*?)\]\(.*?\)/g, "$1");

  // Stage 2: Classify Blocks
  const rawLines = text.split("\n");
  const blocks = [];
  let currentBlockLines = [];
  let currentType = null;
  let startLineNo = 1;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const lineNo = idx + 1;
    const stripped = rawLines[idx].trim();

    if (!stripped) {
      if (currentBlockLines.length > 0) {
        blocks.push({
          type: currentType,
          text: currentBlockLines.join(" "),
          line_no: startLineNo
        });
        currentBlockLines = [];
        currentType = null;
      }
      continue;
    }

    if (/^#{1,6}\s+/.test(stripped)) {
      if (currentBlockLines.length > 0) {
        blocks.push({
          type: currentType,
          text: currentBlockLines.join(" "),
          line_no: startLineNo
        });
        currentBlockLines = [];
      }
      blocks.push({
        type: "HEADING",
        text: stripped.replace(/^#{1,6}\s+/, ""),
        line_no: lineNo
      });
      currentType = null;
      continue;
    }

    if (stripped.startsWith("|") && stripped.endsWith("|")) {
      if (currentBlockLines.length > 0 && currentType !== "TABLE") {
        blocks.push({
          type: currentType,
          text: currentBlockLines.join(" "),
          line_no: startLineNo
        });
        currentBlockLines = [];
      }
      if (currentBlockLines.length === 0) {
        startLineNo = lineNo;
        currentType = "TABLE";
      }
      currentBlockLines.push(stripped);
      continue;
    }

    const isNumList = /^\d+\.\s+/.test(stripped);
    const isBullet = /^[-*]\s+/.test(stripped);
    let firstWord = "";
    if (isNumList) {
      const content = stripped.replace(/^\d+\.\s+/, "");
      const parts = content.split(/\s+/);
      firstWord = parts.length > 0 ? parts[0].toLowerCase().replace(/[.,:;!?]/g, "") : "";
    } else if (isBullet) {
      const content = stripped.replace(/^[-*]\s+/, "");
      const parts = content.split(/\s+/);
      firstWord = parts.length > 0 ? parts[0].toLowerCase().replace(/[.,:;!?]/g, "") : "";
    }

    const isProcedural = isNumList || (isBullet && PROCEDURAL_START_VERBS.has(firstWord));
    if (isProcedural) {
      if (currentBlockLines.length > 0) {
        blocks.push({
          type: currentType,
          text: currentBlockLines.join(" "),
          line_no: startLineNo
        });
        currentBlockLines = [];
      }
      blocks.push({
        type: "PROCEDURAL",
        text: stripped.replace(/^(\d+\.|[-*])\s+/, ""),
        line_no: lineNo
      });
      currentType = null;
      continue;
    }

    if (currentBlockLines.length === 0) {
      startLineNo = lineNo;
      currentType = "DESCRIPTIVE";
    }
    currentBlockLines.push(stripped);
  }

  if (currentBlockLines.length > 0) {
    blocks.push({
      type: currentType,
      text: currentBlockLines.join(" "),
      line_no: startLineNo
    });
  }

  // Stage 3: Split Sentences
  const abbreviations = [
    "e.g.", "i.e.", "vs.", "Fig.", "Ref.", "eq.", "approx.", "min.",
    "max.", "no.", "al.", "sec.", "hr.", "yr.", "deg.", "rad.", "etc."
  ];

  const allSentences = [];
  for (const block of blocks) {
    if (block.type === "HEADING" || block.type === "TABLE") continue;
    let masked = block.text;
    for (const abbr of abbreviations) {
      const rep = abbr.replace(/\./g, "\u2024");
      masked = masked.split(abbr).join(rep);
    }
    masked = masked.replace(/(\d+)\.(\d+)/g, "$1\u2024$2");

    const rawSentences = masked.split(/(?<=[.!?])\s+(?=[A-Z0-9"'_])/);
    for (const rawS of rawSentences) {
      const s = rawS.split("\u2024").join(".").trim();
      if (!s) continue;
      if (/^__MATH_DISPLAY_\d+__$/.test(s) || /^__CODE_BLOCK_\d+__$/.test(s)) continue;
      allSentences.push({
        text: s,
        type: block.type,
        line_no: block.line_no
      });
    }
  }

  // Tokenize & Checks
  function tokenize(sentence) {
    const tokens = [];
    const rawTokens = sentence.split(/\s+/);
    for (const tok of rawTokens) {
      const clean = tok.replace(/^[.,:;!?"'()\[\]{}]+|[.,:;!?"'()\[\]{}]+$/g, "");
      if (!clean) continue;
      if (clean.includes("__MATH_INLINE_") || clean.includes("__CODE_INLINE_")) {
        tokens.push(clean);
      } else if (/^[A-Za-z0-9_-]+$/.test(clean)) {
        tokens.push(clean);
      } else {
        const sub = clean.match(/[A-Za-z0-9_-]+/g);
        if (sub) tokens.push(...sub);
      }
    }
    return tokens;
  }

  const lengthViolations = [];
  const passiveSentences = [];
  const bannedWordViolations = [];
  const nounClusterViolations = [];

  for (const sentence of allSentences) {
    const tokens = tokenize(sentence.text);
    const wordCount = tokens.length;
    const limit = sentence.type === "DESCRIPTIVE" ? 25 : 20;

    if (wordCount > limit) {
      lengthViolations.push({
        rule: "RULE_1_SENTENCE_LENGTH",
        line_no: sentence.line_no,
        type: sentence.type,
        word_count: wordCount,
        limit: limit,
        sentence: sentence.text,
        message: `Rule 1 violation: ${sentence.type.toLowerCase()} sentence has ${wordCount} words (limit: ${limit}).`
      });
    }

    // Passive voice
    const lowerTokens = tokens.map(t => t.toLowerCase());
    let isPassive = false;
    for (let i = 0; i < lowerTokens.length - 1; i++) {
      if (BE_AUXILIARIES.has(lowerTokens[i])) {
        for (const offset of [1, 2]) {
          if (i + offset < lowerTokens.length) {
            const candidate = lowerTokens[i + offset];
            if (IRREGULAR_PAST_PARTICIPLES.has(candidate)) {
              isPassive = true;
              break;
            }
            if (candidate.endsWith("ed") && candidate.length > 4) {
              if (!["speed", "need", "seed", "feed", "bleed"].includes(candidate)) {
                isPassive = true;
                break;
              }
            }
          }
        }
        if (isPassive) break;
      }
    }
    if (isPassive) {
      passiveSentences.push({
        line_no: sentence.line_no,
        sentence: sentence.text
      });
    }

    // Semicolons
    if (sentence.text.includes(";")) {
      bannedWordViolations.push({
        rule: "RULE_1_SEMICOLON",
        line_no: sentence.line_no,
        sentence: sentence.text,
        message: "Rule 1 violation: Semicolons are prohibited in ASD-STE100."
      });
    }

    // Banned words
    for (let idx = 0; idx < lowerTokens.length; idx++) {
      const word = lowerTokens[idx];
      if (BANNED_WORDS[word]) {
        if (word === "as") {
          const prevWord = idx > 0 ? lowerTokens[idx - 1] : "";
          const nextWord = idx + 1 < lowerTokens.length ? lowerTokens[idx + 1] : "";
          if (prevWord === "such" || nextWord === "well" || prevWord === "well") continue;
        }
        if (word === "since") {
          const nextWord = idx + 1 < lowerTokens.length ? lowerTokens[idx + 1] : "";
          if (/^\d{4}$/.test(nextWord)) continue;
        }
        bannedWordViolations.push({
          rule: "RULE_3_BANNED_WORD",
          line_no: sentence.line_no,
          word: word,
          sentence: sentence.text,
          message: `Rule 3 violation: Banned ambiguous word '${word}'. ${BANNED_WORDS[word]}`
        });
      }
    }

    // Noun clusters
    let consecutiveNouns = [];
    for (const word of lowerTokens) {
      const clean = word.replace(/[^a-z]/g, "");
      const isNoun = COMMON_NOUNS.has(clean) || ["tion", "ment", "ance", "ence", "ity", "meter", "array"].some(sfx => clean.endsWith(sfx));
      if (isNoun) {
        consecutiveNouns.push(clean);
        if (consecutiveNouns.length > 3) {
          nounClusterViolations.push({
            rule: "RULE_5_NOUN_CLUSTER",
            line_no: sentence.line_no,
            phrase: consecutiveNouns.join(" "),
            sentence: sentence.text,
            message: `Rule 5 violation: Noun cluster of length ${consecutiveNouns.length}: '${consecutiveNouns.join(" ")}'.`
          });
        }
      } else {
        consecutiveNouns = [];
      }
    }
  }

  const totalSentences = allSentences.length;
  const descriptiveCount = allSentences.filter(s => s.type === "DESCRIPTIVE").length;
  const proceduralCount = allSentences.filter(s => s.type === "PROCEDURAL").length;
  const passiveCount = passiveSentences.length;
  const passivePercentage = totalSentences > 0 ? (passiveCount / totalSentences * 100.0) : 0.0;

  const rule2Violations = [];
  if (passivePercentage >= 5.0) {
    rule2Violations.push({
      rule: "RULE_2_PASSIVE_CEILING_EXCEEDED",
      passive_percentage: Number(passivePercentage.toFixed(2)),
      limit: 5.0,
      passive_count: passiveCount,
      total_sentences: totalSentences,
      message: `Rule 2 violation: Passive voice incidence is ${passivePercentage.toFixed(2)}% (limit: <5.0%).`
    });
  }

  // Stage 8: Glossary
  const glossaryViolations = [];
  const lowerFull = rawText.toLowerCase();
  for (const [term, meta] of Object.entries(APPROVED_GLOSSARY)) {
    for (const forbidden of meta.forbidden_synonyms || []) {
      const pattern = forbidden === "lead angle" ? "(?<!pointing\\s)\\blead angle\\b" : `\\b${forbidden}\\b`;
      const re = new RegExp(pattern, 'gi');
      const matches = lowerFull.match(re);
      if (matches) {
        glossaryViolations.push({
          rule: "RULE_4_FORBIDDEN_SYNONYM",
          term: term,
          forbidden_synonym: forbidden,
          occurrences: matches.length,
          message: `Rule 4 violation: Forbidden synonym '${forbidden}' used instead of approved term '${term}'.`
        });
      }
    }
  }

  const allViolations = [
    ...lengthViolations,
    ...rule2Violations,
    ...bannedWordViolations,
    ...nounClusterViolations,
    ...glossaryViolations
  ];

  return {
    file: filePath,
    status: allViolations.length === 0 ? "PASS" : "FAIL",
    summary: {
      total_sentences: totalSentences,
      descriptive_sentences: descriptiveCount,
      procedural_sentences: proceduralCount,
      passive_sentences: passiveCount,
      passive_percentage: Number(passivePercentage.toFixed(2)),
      rule_1_violations: lengthViolations.length,
      rule_2_violations: rule2Violations.length,
      rule_3_violations: bannedWordViolations.length,
      rule_4_violations: glossaryViolations.length,
      rule_5_violations: nounClusterViolations.length,
      total_violations: allViolations.length
    },
    violations: allViolations,
    passive_instances: passiveSentences
  };
}

// CLI execution in JSC
if (typeof arguments !== 'undefined' && arguments.length > 0) {
  const filePath = arguments[0];
  try {
    const content = read(filePath);
    const result = lintText(content, filePath);
    print(`============================================================`);
    print(` ASD-STE100 Linter Report (JSC): ${result.file}`);
    print(` Status: ${result.status}`);
    print(`============================================================`);
    print(` Total Sentences:        ${result.summary.total_sentences}`);
    print(`   - Descriptive:        ${result.summary.descriptive_sentences}`);
    print(`   - Procedural:         ${result.summary.procedural_sentences}`);
    print(` Passive Voice Sentences: ${result.summary.passive_sentences} (${result.summary.passive_percentage}%) [Limit: <5.0%]`);
    print(` Rule Violations Breakdown:`);
    print(`   - Rule 1 (Length):     ${result.summary.rule_1_violations}`);
    print(`   - Rule 2 (Passive):    ${result.summary.rule_2_violations}`);
    print(`   - Rule 3 (Banned):     ${result.summary.rule_3_violations}`);
    print(`   - Rule 4 (Glossary):   ${result.summary.rule_4_violations}`);
    print(`   - Rule 5 (Clusters):   ${result.summary.rule_5_violations}`);
    print(` Total Violations:       ${result.summary.total_violations}`);
    print(`============================================================`);

    if (result.violations.length > 0) {
      print(`\nVIOLATION DETAILS:`);
      result.violations.forEach((v, idx) => {
        const line = v.line_no ? `Line ${v.line_no}: ` : "";
        print(`  [${idx + 1}] ${line}${v.rule} — ${v.message}`);
        if (v.sentence) {
          const s = v.sentence.length > 90 ? v.sentence.slice(0, 87) + "..." : v.sentence;
          print(`      Text: "${s}"`);
        }
      });
      print("");
      quit(1);
    } else {
      print(`All text passed ASD-STE100 compliance checks!`);
      quit(0);
    }
  } catch (err) {
    print(`Error linting file ${filePath}: ${err}`);
    quit(1);
  }
}
