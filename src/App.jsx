import React, { useState, useCallback } from "react";

// ── Valid types ───────────────────────────────────────────────────────────────
const VALID_BASE_TYPES = new Set([
  "Negative Scope","Statutory Exclusion","Cross-Act Mismatch",
  "Jurisdictional / Territorial","Jurisdictional / Pecuniary","Jurisdictional / Subject Matter",
  "Authority Hierarchy","Procedural Chronology","Limitation / Time-Bar",
  "Cognizable vs Non-Cognizable","Bailable vs Non-Bailable","Compoundability",
  "Interim Relief","Execution of Decree","Appeal / Revision / Review",
  "Transfer of Cases","Bail / Anticipatory Bail","Charge Framing","Cognizance Trigger",
  "Ingredient Test","Mens Rea","Quantum / Sentencing","General Exception",
  "Attempt vs Preparation","Abetment / Conspiracy","Vicarious Liability","Remedy Filter",
  "Admissibility","Burden of Proof","Presumption","Estoppel",
  "Hearsay / Exception","Documentary Evidence","Electronic Evidence",
  "Expert Opinion","Character Evidence","Dying Declaration",
  "Mandatory vs Discretionary","Non-Obstante Clause","Proviso Interpretation",
  "Explanation Clause","Illustration vs Law","Strict vs Liberal Construction","Purposive Interpretation",
  "Statutory Definition","Scope of Application",
  "Numerical Threshold","Provision Locator"
]);

// ── Key orders ────────────────────────────────────────────────────────────────
const SH_KEYS = [
  "Section Number","Entry_ID","Question","Subsection/Clause","Section Text",
  "IRAC_Reasoning","Answer","NO_IRAC_Reasoning","Type","Difficulty","Keywords","Cited Acts and Sections"
];
const ADV_KEYS = [
  "Question","Entry_ID","Section Number","Subsection/Clause","Section Text",
  "Possible Sections","IRAC_Reasoning","Answer","NO_IRAC_Reasoning",
  "Relevant Section","Type","Difficulty","Keywords","Cited Acts and Sections"
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const countWords = s => (!s || typeof s !== "string") ? 0 : s.trim().split(/\s+/).filter(Boolean).length;

const ACT_CITATION_PREFIX_RE = /^(?:The\s+)?[\w\s]+(?:Act|Code|Procedure|Ordinance|Rules?),\s*\d{4},\s*(?:Section|Order|Rule|Schedule|Article)\b/i;

function countSentences(s) {
  if (!s || typeof s !== "string" || !s.trim()) return 0;
  const c = s
    .replace(/\b(Section|Order|Rule|Art|Cl|Sub|No|vs|etc|ibid|viz|e\.g|i\.e)\./gi, "$1_")
    .replace(/\d+\.\d+/g, m => m.replace(".", "_"))
    .replace(/\([a-zA-Z0-9]+\)\./g, m => m.replace(".", "_"))
    .replace(/\([\u0980-\u09FF\u09E6-\u09EF]+\)\./g, m => m.replace(".", "_"));
  const m = c.match(/[^.!?।]+[.!?।]+/g);
  return m ? m.filter(x => x.trim().length > 2).length : (s.trim().length > 0 ? 1 : 0);
}

const hasCitation = s => !!s && /(?:The\s+)?[\w\s]+(?:Act|Code|Procedure|Ordinance|Rules?),\s*\d{4}/i.test(s);
const isBangla = s => typeof s === "string" && /[\u0980-\u09FF]/.test(s);
const hasBanglaChar = isBangla;
const isEntryBangla = entry =>
  isBangla(entry?.["Question"] || "") || isBangla(entry?.["Answer"] || "");
const startsWithBanglaActCitation = s => {
  if (!s) return false;
  const t = s.trim();
  return /^The\s+\w/i.test(t) && /অনুযায়ী/.test(t);
};
const startsWithActCitation = s => !!s && ACT_CITATION_PREFIX_RE.test(s.trim());
const startsWithUnder = s => !!s && /^under\s/i.test(s.trim());
const hasMetaLanguage = s => !!s && [
  /the correct section is/i, /the answer is section/i,
  /section \w+ is correct/i, /the governing section is/i,
  /সঠিক ধারা হলো/, /সঠিক ধারাটি হলো/,
  /উত্তর হলো ধারা/, /ধারাটি সঠিক/,
  /পরিচালনাকারী ধারা হলো/, /সঠিক section হলো/i,
].some(p => p.test(s));
const isBareAssertion = s => !!s && [
  /^this section does not apply\.?$/i,
  /^not applicable\.?$/i,
  /^does not apply here\.?$/i,
  /^not relevant\.?$/i,
  /^this is not the right section\.?$/i,
  /^applicable\.?$/i,
  /^this section applies\.?$/i,
  /^প্রযোজ্য নয়।?$/,
  /^এই ধারা প্রযোজ্য নয়।?$/,
  /^এটি প্রযোজ্য নয়।?$/,
  /^এখানে প্রযোজ্য নয়।?$/,
  /^প্রাসঙ্গিক নয়।?$/,
  /^সংশ্লিষ্ট নয়।?$/,
  /^এটি সঠিক ধারা নয়।?$/,
  /^প্রযোজ্য।?$/,
  /^এই ধারা প্রযোজ্য।?$/,
  /^এটি প্রযোজ্য।?$/,
  /^এখানে প্রযোজ্য।?$/,
].some(p => p.test(s.trim()));

const getFirstWord = s => s ? s.trim().split(/\s+/)[0].toLowerCase() : "";
const getFirstN = (s, n) => s ? s.trim().split(/\s+/).slice(0, n).join(" ").toLowerCase() : "";

function detectType(e) {
  if (!e || typeof e !== "object") return "unknown";
  if (e["Relevant Section"] === "None") return "null_relevance";
  if ("Relevant Section" in e) return "advanced_selection";
  return "single_hop";
}

function detectEntryLanguage(entry) {
  if (!entry || typeof entry !== "object") return "en";
  const irac = entry["IRAC_Reasoning"];
  const samples = [
    entry["Question"],
    entry["Answer"],
    entry["NO_IRAC_Reasoning"],
    irac && typeof irac === "object" ? irac["Issue"] : "",
  ];
  return samples.some(hasBanglaChar) ? "bn" : "en";
}

// ── Grading ───────────────────────────────────────────────────────────────────
// PASS  = 0 mandatory errors  (warnings are advisory — never affect grade)
// FAIL  = 1+ mandatory errors
// There is no counting rule for warnings. Accumulate as many as you want.
// "clean"  = 0 errors, 0 warnings
// "pass"   = 0 errors, 1+ warnings
// "fail"   = 1+ errors

function getGrade(errors, warnings) {
  if (errors.length > 0) return "fail";
  if (warnings.length === 0) return "clean";
  return "pass";
}

const GM = {
  clean: { label: "Clean",    icon: "✓", color: "#22c55e", bg: "#052e16", border: "#166534" },
  pass:  { label: "Pass",     icon: "✓", color: "#86efac", bg: "#052e16", border: "#166534" },
  fail:  { label: "Fail",     icon: "✗", color: "#ef4444", bg: "#1c0a0a", border: "#7f1d1d" },
};

// ── Check definitions (for the grid display) ──────────────────────────────────
// Each check has: code, label, kind ("mandatory"|"advisory")
const CHECKS = {
  single_hop: [
    { code:"E01", label:'Required keys present',                         kind:"mandatory" },
    { code:"E02", label:'"Cited Acts and Sections" is last key',         kind:"mandatory" },
    { code:"E03", label:'Entry_ID is integer, no duplicates',            kind:"mandatory" },
    { code:"E04", label:'Section Number non-empty',                      kind:"mandatory" },
    { code:"E05", label:'Question non-empty',                            kind:"mandatory" },
    { code:"E06", label:'Section Text non-empty',                        kind:"mandatory" },
    { code:"E07", label:'Keywords is an array',                          kind:"mandatory" },
    { code:"E08", label:'Type from QUESTION_TYPE_VOCABULARY.md',         kind:"mandatory" },
    { code:"E09", label:'Difficulty: Easy / Medium / Hard',              kind:"mandatory" },
    { code:"E10", label:'IRAC has Issue/Rule/Application, no Conclusion',kind:"mandatory" },
    { code:"E11", label:'IRAC Issue non-empty',                          kind:"mandatory" },
    { code:"E12", label:'Rule is a string (not object), non-empty',      kind:"mandatory" },
    { code:"E13", label:'Application is a string (not object), non-empty',kind:"mandatory"},
    { code:"E23", label:'Bangla entries: IRAC values must be in Bangla', kind:"mandatory" },
    { code:"E21", label:'Answer starts "Under [Act Name]," (EN) or "[Act Name] অনুযায়ী" (BN)', kind:"mandatory" },
    { code:"E22", label:'NO_IRAC non-empty, no IRAC labels',             kind:"mandatory" },
    { code:"W09", label:'IRAC total 45–70 words',                        kind:"advisory"  },
    { code:"W15", label:'Answer 25–45 words',                            kind:"advisory"  },
    { code:"W17", label:'NO_IRAC 30–50 words',                           kind:"advisory"  },
    { code:"W18", label:'NO_IRAC contains legislative citation',         kind:"advisory"  },
    { code:"W06", label:'Rule: 1 sentence',                              kind:"advisory"  },
    { code:"W08", label:'Application: 1–2 sentences',                    kind:"advisory"  },
    { code:"W07", label:'Rule: no verbatim text from Section Text',      kind:"advisory"  },
  ],
  advanced_selection: [
    { code:"E01", label:'Required keys present',                         kind:"mandatory" },
    { code:"E02", label:'"Cited Acts and Sections" is last key',         kind:"mandatory" },
    { code:"E03", label:'Entry_ID is integer, no duplicates',            kind:"mandatory" },
    { code:"E04", label:'Section Number non-empty',                      kind:"mandatory" },
    { code:"E05", label:'Question non-empty',                            kind:"mandatory" },
    { code:"E06", label:'Section Text non-empty',                        kind:"mandatory" },
    { code:"E07", label:'Keywords is an array',                          kind:"mandatory" },
    { code:"E08", label:'Type from vocabulary, no "Negative Extraction" prefix', kind:"mandatory" },
    { code:"E09", label:'Difficulty: Very High (Contextual Selection)',  kind:"mandatory" },
    { code:"E10", label:'IRAC has Issue/Rule/Application, no Conclusion',kind:"mandatory" },
    { code:"E11", label:'IRAC Issue non-empty',                          kind:"mandatory" },
    { code:"E15", label:'Rule is object with 5 keys, all non-empty',     kind:"mandatory" },
    { code:"E16", label:'Application: object, 5 keys, no bare assertions',kind:"mandatory"},
    { code:"E23", label:'Bangla entries: IRAC values must be in Bangla', kind:"mandatory" },
    { code:"E17", label:'Possible Sections: exactly 5, all with Full Text',kind:"mandatory"},
    { code:"E18", label:'Correct section present in Possible Sections',  kind:"mandatory" },
    { code:"E19", label:'"Relevant Section" matches a Possible Section', kind:"mandatory" },
    { code:"E21", label:'Answer starts correctly (EN/BN), no meta-language',kind:"mandatory"},
    { code:"E22", label:'NO_IRAC non-empty, no IRAC labels, citation present',kind:"mandatory"},
    { code:"W15", label:'Answer 25–45 words',                            kind:"advisory"  },
    { code:"W17", label:'NO_IRAC 40–60 words',                           kind:"advisory"  },
    { code:"W11", label:'Rule entries: 1 sentence each',                 kind:"advisory"  },
    { code:"W14", label:'Application entries: 1 sentence each',          kind:"advisory"  },
    { code:"W05", label:'Issue ≤15 words',                               kind:"advisory"  },
  ],
  null_relevance: [
    { code:"E01", label:'Required keys present',                         kind:"mandatory" },
    { code:"E02", label:'"Cited Acts and Sections" is last key',         kind:"mandatory" },
    { code:"E03", label:'Entry_ID is integer, no duplicates',            kind:"mandatory" },
    { code:"E04", label:'Section Number non-empty',                      kind:"mandatory" },
    { code:"E05", label:'Question non-empty',                            kind:"mandatory" },
    { code:"E06", label:'Section Text non-empty',                        kind:"mandatory" },
    { code:"E07", label:'Keywords is an array',                          kind:"mandatory" },
    { code:"E08", label:'Type starts with "Negative Extraction / [type]"',kind:"mandatory"},
    { code:"E09", label:'Difficulty: High (Validation Reasoning)',        kind:"mandatory" },
    { code:"E10", label:'IRAC has Issue/Rule/Application, no Conclusion',kind:"mandatory" },
    { code:"E11", label:'IRAC Issue non-empty',                          kind:"mandatory" },
    { code:"E15", label:'Rule is object with 5 keys, all non-empty',     kind:"mandatory" },
    { code:"E16", label:'Application: object, 5 keys, no bare assertions',kind:"mandatory"},
    { code:"E23", label:'Bangla entries: IRAC values must be in Bangla', kind:"mandatory" },
    { code:"E17", label:'Possible Sections: exactly 5, all with Full Text',kind:"mandatory"},
    { code:"E18", label:'Exclusion rule: correct section NOT in Possible Sections',kind:"mandatory"},
    { code:"E19", label:'"Relevant Section" is exactly "None"',          kind:"mandatory" },
    { code:"E20", label:'"Cited Acts and Sections" is "N/A (No relevant section in set)"',kind:"mandatory"},
    { code:"E21", label:'Answer non-empty, no citation, no Act citation prefix',kind:"mandatory"},
    { code:"E22", label:'NO_IRAC non-empty, no IRAC labels, no citation (exception rule)',kind:"mandatory"},
    { code:"W15", label:'Answer 25–40 words',                            kind:"advisory"  },
    { code:"W17", label:'NO_IRAC 30–50 words',                           kind:"advisory"  },
    { code:"W11", label:'Rule entries: 1 sentence each',                 kind:"advisory"  },
    { code:"W14", label:'Application entries: 1 sentence each',          kind:"advisory"  },
    { code:"W05", label:'Issue ≤15 words',                               kind:"advisory"  },
  ],
};

// ── Validator ─────────────────────────────────────────────────────────────────
function validateEntry(entry, idx, all) {
  const errors = [];   // mandatory failures
  const warnings = []; // advisory notices
  const err  = (code, msg) => errors.push({ code, msg });
  const warn = (code, msg) => warnings.push({ code, msg });
  const et = detectType(entry);
  const bangla = isEntryBangla(entry);

  // E01 — Required keys
  const expectedKeys = et === "single_hop" ? SH_KEYS : ADV_KEYS;
  expectedKeys.forEach(k => { if (!(k in entry)) err("E01", `Missing required key: "${k}"`); });

  // E02 — Last key
  const ak = Object.keys(entry);
  if (ak[ak.length - 1] !== "Cited Acts and Sections")
    err("E02", `"Cited Acts and Sections" must be last key. Got: "${ak[ak.length - 1]}"`);

  // E03 — Entry_ID
  const eid = entry["Entry_ID"];
  if (eid === undefined || eid === null || !Number.isInteger(eid))
    err("E03", `Entry_ID must be an integer. Got: ${JSON.stringify(eid)}`);
  else {
    if (eid !== idx + 1) warn("W01", `Entry_ID is ${eid}, expected ${idx + 1} (sequential check).`);
    if (all.filter((e, i) => i !== idx && e["Entry_ID"] === eid).length > 0)
      err("E03", `Duplicate Entry_ID: ${eid}`);
  }

  // E04–E06 — Core fields
  const sn = entry["Section Number"];
  if (!sn || !sn.trim()) err("E04", "Section Number is empty.");
  const q = entry["Question"];
  if (!q || !q.trim()) err("E05", "Question is empty.");
  const st = entry["Section Text"];
  if (!st || !st.trim()) err("E06", "Section Text is empty.");
  else if (st.trim().length < 20) warn("W02", "Section Text is very short — possible truncation.");

  // E07 — Keywords
  const kw = entry["Keywords"];
  if (!Array.isArray(kw))
    err("E07", "Keywords must be an array.");
  else if (kw.length < 3 || kw.length > 5)
    warn("W03", `Keywords should have 3–5 items. Found: ${kw.length}`);

  // E08 — Type
  const tv = entry["Type"];
  if (!tv || typeof tv !== "string") {
    err("E08", "Type is missing or not a string.");
  } else if (et === "null_relevance") {
    if (!tv.startsWith("Negative Extraction / "))
      err("E08", `NR Type must start with "Negative Extraction / ". Got: "${tv}"`);
    else {
      const base = tv.replace("Negative Extraction / ", "");
      if (!VALID_BASE_TYPES.has(base))
        err("E08", `Base type "${base}" not in QUESTION_TYPE_VOCABULARY.md`);
    }
  } else {
    if (tv.startsWith("Negative Extraction / "))
      err("E08", `Non-NR entries must not use "Negative Extraction / " prefix.`);
    else if (!VALID_BASE_TYPES.has(tv))
      err("E08", `Type "${tv}" not in QUESTION_TYPE_VOCABULARY.md`);
  }

  // E09 — Difficulty
  const df = entry["Difficulty"];
  if (et === "single_hop" && !["Easy","Medium","Hard"].includes(df))
    err("E09", `Difficulty must be Easy/Medium/Hard. Got: "${df}"`);
  if (et === "advanced_selection" && df !== "Very High (Contextual Selection)")
    err("E09", `Difficulty must be "Very High (Contextual Selection)". Got: "${df}"`);
  if (et === "null_relevance" && df !== "High (Validation Reasoning)")
    err("E09", `Difficulty must be "High (Validation Reasoning)". Got: "${df}"`);

  // E10 — IRAC structure
  const irac = entry["IRAC_Reasoning"];
  if (!irac || typeof irac !== "object" || Array.isArray(irac)) {
    err("E10", "IRAC_Reasoning must be an object.");
  } else {
    if ("Conclusion" in irac) err("E10", 'IRAC_Reasoning must NOT have a "Conclusion" key.');
    ["Issue","Rule","Application"].forEach(k => {
      if (!(k in irac)) err("E10", `IRAC_Reasoning missing field: "${k}"`);
    });

    // E11 — Issue
    const iss = irac["Issue"];
    if (!iss || typeof iss !== "string" || !iss.trim())
      err("E11", "IRAC Issue is empty.");
    else {
      if (countSentences(iss) > 1) warn("W04", `Issue has ${countSentences(iss)} sentences — target is 1.`);
      if (et !== "single_hop" && countWords(iss) > 15) warn("W05", `Issue is ${countWords(iss)} words — target ≤15.`);
    }

    // Single-hop Rule + Application
    if (et === "single_hop") {
      const rule = irac["Rule"], app = irac["Application"];

      // E12 — Rule
      if (typeof rule !== "string")
        err("E12", "Single-Hop Rule must be a string (not an object).");
      else if (!rule.trim())
        err("E12", "Rule is empty.");
      else {
        if (countSentences(rule) > 1) warn("W06", `Rule has ${countSentences(rule)} sentences — target is 1.`);
        // Verbatim check
        if (st && typeof st === "string") {
          const rw = rule.toLowerCase().split(/\s+/);
          for (let i = 0; i <= rw.length - 7; i++) {
            const chunk = rw.slice(i, i + 7).join(" ");
            if (st.toLowerCase().includes(chunk)) {
              warn("W07", `Rule may contain verbatim text from Section Text: "...${chunk}..."`);
              break;
            }
          }
        }
      }

      // E13 — Application
      if (typeof app !== "string")
        err("E13", "Single-Hop Application must be a string (not an object).");
      else if (!app.trim())
        err("E13", "Application is empty.");
      else {
        if (countSentences(app) > 2) warn("W08", `Application has ${countSentences(app)} sentences — target is 1–2.`);
      }

      // IRAC total word count — advisory
      const tw = countWords(typeof iss==="string"?iss:"") + countWords(typeof rule==="string"?rule:"") + countWords(typeof app==="string"?app:"");
      if (tw < 45 || tw > 70) warn("W09", `IRAC total is ${tw} words — target is 45–70.`);
    }

    // Adv / NR Rule + Application
    if (et === "advanced_selection" || et === "null_relevance") {
      const rule = irac["Rule"], app = irac["Application"];

      // E15 — Rule object
      if (typeof rule !== "object" || Array.isArray(rule) || !rule) {
        err("E15", "IRAC Rule must be an object.");
      } else {
        const rk = Object.keys(rule);
        if (rk.length !== 5) err("E15", `IRAC Rule must have 5 keys. Got: ${rk.length}`);
        rk.forEach(k => {
          if (typeof rule[k] !== "string" || !rule[k].trim())
            err("E15", `IRAC Rule["${k}"] is empty or not a string.`);
          else if (countSentences(rule[k]) > 1)
            warn("W11", `IRAC Rule["${k}"] has ${countSentences(rule[k])} sentences — target is 1.`);
        });
      }

      // E16 — Application object
      if (typeof app !== "object" || Array.isArray(app) || !app) {
        err("E16", "IRAC Application must be an object.");
      } else {
        const ak2 = Object.keys(app);
        if (ak2.length !== 5) err("E16", `IRAC Application must have 5 keys. Got: ${ak2.length}`);
        ak2.forEach(k => {
          if (typeof app[k] !== "string" || !app[k].trim())
            err("E16", `IRAC Application["${k}"] is empty or not a string.`);
          else {
            if (isBareAssertion(app[k]))
              err("E16", `IRAC Application["${k}"] is a bare assertion — legal reasoning required.`);
            else if (countSentences(app[k]) > 1)
              warn("W14", `IRAC Application["${k}"] has ${countSentences(app[k])} sentences — target is 1.`);
          }
        });
      }
    }
  }

  // E17 — Possible Sections
  if (et === "advanced_selection" || et === "null_relevance") {
    const ps = entry["Possible Sections"];
    if (!Array.isArray(ps)) {
      err("E17", "Possible Sections must be an array.");
    } else {
      if (ps.length !== 5) err("E17", `Possible Sections must have exactly 5 entries. Got: ${ps.length}`);
      ps.forEach((s, i) => {
        if (!s["Section Number"] || !s["Full Text"] || !s["Full Text"].trim())
          err("E17", `Possible Sections[${i}] missing "Section Number" or "Full Text".`);
      });
      const psNums = ps.map(s => s["Section Number"]);
      // E18
      if (et === "advanced_selection" && sn && !psNums.includes(sn))
        err("E18", `Correct section "${sn}" must appear in Possible Sections.`);
      if (et === "null_relevance" && sn && psNums.includes(sn))
        err("E18", `Exclusion rule violated: "${sn}" must NOT appear in Possible Sections.`);
    }
  }

  // E23 — Bangla IRAC content check
  if (bangla) {
    const ir = entry["IRAC_Reasoning"];
    if (!ir || typeof ir !== "object" || Array.isArray(ir)) {
      err("E23", "Bangla entries must include IRAC_Reasoning values in Bangla.");
    } else {
      const issue = typeof ir["Issue"] === "string" ? ir["Issue"] : "";
      if (!hasBanglaChar(issue)) err("E23", "Bangla entry IRAC Issue must contain Bangla text.");

      if (et === "single_hop") {
        const rule = typeof ir["Rule"] === "string" ? ir["Rule"] : "";
        const app = typeof ir["Application"] === "string" ? ir["Application"] : "";
        if (!hasBanglaChar(rule)) err("E23", "Bangla entry IRAC Rule must contain Bangla text.");
        if (!hasBanglaChar(app)) err("E23", "Bangla entry IRAC Application must contain Bangla text.");
      } else {
        const ruleObj = ir["Rule"];
        const appObj = ir["Application"];
        if (ruleObj && typeof ruleObj === "object" && !Array.isArray(ruleObj)) {
          Object.entries(ruleObj).forEach(([k, v]) => {
            if (typeof v === "string" && !hasBanglaChar(v)) {
              err("E23", `Bangla entry IRAC Rule["${k}"] must contain Bangla text.`);
            }
          });
        }
        if (appObj && typeof appObj === "object" && !Array.isArray(appObj)) {
          Object.entries(appObj).forEach(([k, v]) => {
            if (typeof v === "string" && !hasBanglaChar(v)) {
              err("E23", `Bangla entry IRAC Application["${k}"] must contain Bangla text.`);
            }
          });
        }
      }
    }
  }

  // E19 — Relevant Section
  if (et === "advanced_selection") {
    const rs = entry["Relevant Section"];
    if (!rs || rs === "None")
      err("E19", `Advanced Selection "Relevant Section" must name the correct section, not "None".`);
    else {
      const ps = entry["Possible Sections"];
      if (Array.isArray(ps) && !ps.map(s => s["Section Number"]).includes(rs))
        err("E19", `"Relevant Section" "${rs}" doesn't match any of the 5 Possible Sections.`);
    }
  }
  if (et === "null_relevance") {
    if (entry["Relevant Section"] !== "None")
      err("E19", `NR "Relevant Section" must be exactly "None". Got: "${entry["Relevant Section"]}"`);
    // E20
    if (entry["Cited Acts and Sections"] !== "N/A (No relevant section in set)")
      err("E20", `NR "Cited Acts and Sections" must be exactly "N/A (No relevant section in set)".`);
  }

  // E21 — Answer
  const ans = entry["Answer"];
  if (!ans || typeof ans !== "string" || !ans.trim()) {
    err("E21", "Answer is empty or missing.");
  } else {
    const aw = countWords(ans);
    if (et === "single_hop" || et === "advanced_selection") {
      const validStart = bangla ? startsWithBanglaActCitation(ans) : startsWithUnder(ans);
      if (!validStart)
        err("E21", bangla
          ? `Bangla Answer must start with Act name (English) and contain "অনুযায়ী". Got: "${ans.substring(0, 60)}..."`
          : `Answer must begin with "Under [Act Name],". Got: "${ans.substring(0, 50)}..."`
        );
      if (et === "advanced_selection" && hasMetaLanguage(ans))
        err("E21", 'Answer must not use meta-language like "The correct section is..."');
      if (aw < 25 || aw > 45) warn("W15", `Answer is ${aw} words — target is 25–45.`);
    }
    if (et === "null_relevance") {
      if (hasCitation(ans))
        err("E21", "NR Answer must NOT contain a legislative citation (absent section must not be named).");
      if (startsWithUnder(ans))
        err("E21", "NR Answer must not start with 'Under' — citation is forbidden in NR answers.");
      if (bangla && startsWithBanglaActCitation(ans))
        err("E21", "NR Bangla Answer must not start with an Act citation — the governing section is absent.");
      if (aw < 25 || aw > 40) warn("W15", `Answer is ${aw} words — target is 25–40.`);
    }
  }

  // E22 — NO_IRAC_Reasoning
  const ni = entry["NO_IRAC_Reasoning"];
  if (!ni || typeof ni !== "string" || !ni.trim()) {
    err("E22", "NO_IRAC_Reasoning is empty.");
  } else {
    if (
      /\b(Issue|Rule|Application|Conclusion)\s*:/i.test(ni) ||
      /\b(ইস্যু|রুল|অ্যাপ্লিকেশন|প্রয়োগ|সিদ্ধান্ত)\s*:/i.test(ni)
    )
      err("E22", "NO_IRAC_Reasoning must not contain IRAC labels (Issue:, Rule:, Application:, or their Bangla equivalents)");
    const nw = countWords(ni), ns = countSentences(ni);
    if (ns > 5) warn("W16", `NO_IRAC_Reasoning has ${ns} sentences — target is 2–3.`);
    if (et === "single_hop") {
      if (nw < 30 || nw > 50) warn("W17", `NO_IRAC_Reasoning is ${nw} words — target is 30–50.`);
      if (!hasCitation(ni)) warn("W18", "NO_IRAC_Reasoning should include a legislative citation.");
    }
    if (et === "advanced_selection") {
      if (nw < 40 || nw > 60) warn("W17", `NO_IRAC_Reasoning is ${nw} words — target is 40–60.`);
      if (!hasCitation(ni)) err("E22", "NO_IRAC_Reasoning must include a legislative citation.");
    }
    if (et === "null_relevance") {
      if (nw < 30 || nw > 50) warn("W17", `NO_IRAC_Reasoning is ${nw} words — target is 30–50.`);
      if (hasCitation(ni)) err("E22", "NR NO_IRAC_Reasoning must NOT contain a citation (exception rule).");
    }
  }

  const grade = getGrade(errors, warnings);
  return { errors, warnings, grade, entryType: et };
}

// ── Batch checks ──────────────────────────────────────────────────────────────
function validateBatch(entries) {
  const bw = [];
  const sh = entries.filter(e => detectType(e) === "single_hop");
  if (sh.length >= 5) {
    const starters = sh.map(e => e["IRAC_Reasoning"]?.["Application"])
      .filter(a => typeof a === "string").map(a => getFirstWord(a));
    const freq = {}; starters.forEach(w => freq[w] = (freq[w] || 0) + 1);
    Object.entries(freq).forEach(([w, c]) => {
      if (c / starters.length > 0.6)
        bw.push(`Application starters: ${c}/${starters.length} single-hop entries start with "${w}" — vary constructions.`);
    });
  }
  const nr = entries.filter(e => detectType(e) === "null_relevance");
  if (nr.length >= 4) {
    const op = nr.map(e => e["Answer"]).filter(a => typeof a === "string").map(a => getFirstN(a, 5));
    const seen = new Set(), dupes = new Set();
    op.forEach(o => { if (seen.has(o)) dupes.add(o); else seen.add(o); });
    if (dupes.size > 0) bw.push(`${dupes.size} NR Answer(s) share opening phrasing — use varied wording.`);
  }
  const allQ = entries.map(e => e["Question"] || "").join(" ");
  const names = allQ.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  const nf = {}; names.forEach(n => nf[n] = (nf[n] || 0) + 1);
  const skip = new Set(["Scenario","Section","Code","Bangladesh","India","Court","Act","The","Under","This","Dhaka","Chittagong"]);
  const rep = Object.entries(nf).filter(([n, c]) => c >= 3 && !skip.has(n));
  if (rep.length > 0) bw.push(`Character names reused ≥3×: ${rep.map(([n]) => n).join(", ")} — vary factual contexts.`);
  for (let i = 0; i <= entries.length - 10; i++) {
    const types = new Set(entries.slice(i, i + 10).map(e => {
      const t = e["Type"] || "";
      return t.startsWith("Negative Extraction / ") ? t.replace("Negative Extraction / ", "") : t;
    }));
    if (types.size < 6) { bw.push(`Entries ${i+1}–${i+10}: ${types.size} distinct types (target ≥6).`); break; }
  }
  for (let i = 0; i < entries.length - 2; i++) {
    const [t1,t2,t3] = [entries[i]["Type"]||"", entries[i+1]["Type"]||"", entries[i+2]["Type"]||""];
    if (t1 === t2 && t2 === t3) bw.push(`Entries ${i+1}–${i+3}: same Type "${t1}" three times in a row.`);
  }
  return bw;
}

// ── UI ────────────────────────────────────────────────────────────────────────
const TL = { single_hop:"Single-Hop", advanced_selection:"Adv. Selection", null_relevance:"Null Relevance" };
const TC = { single_hop:"#3b82f6", advanced_selection:"#8b5cf6", null_relevance:"#ef4444" };

export default function App() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState(null);
  const [active, setActive] = useState(null);
  const [filter, setFilter] = useState("all");

  const run = useCallback(() => {
    let parsed;
    try { parsed = JSON.parse(input.trim()); }
    catch (e) { setResults({ parseError: `Invalid JSON: ${e.message}` }); setActive(null); return; }
    if (!Array.isArray(parsed)) { setResults({ parseError: "Input must be a JSON array." }); setActive(null); return; }
    const er = parsed.map((e, i) => {
      const r = validateEntry(e, i, parsed);
      return { ...r, index: i, entryId: e["Entry_ID"] ?? i+1, sectionNum: e["Section Number"] ?? "—" };
    });
    const bw = validateBatch(parsed);
    const gc = { clean: 0, pass: 0, fail: 0 };
    er.forEach(r => gc[r.grade]++);
    setResults({ er, bw, gc, total: parsed.length });
    setActive(er[0] ?? null);
    setFilter("all");
  }, [input]);

  const filtered = (results?.er || []).filter(r => filter === "all" || r.grade === filter);

  return (
    <div style={{ fontFamily:"'IBM Plex Mono',monospace", background:"#080b12", minHeight:"100vh", color:"#e2e8f0", display:"flex", flexDirection:"column" }}>

      {/* Header */}
      <div style={{ background:"#0d1117", borderBottom:"1px solid #1e293b", padding:"14px 22px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <div style={{ width:32, height:32, background:"linear-gradient(135deg,#4f46e5,#7c3aed)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"white", flexShrink:0 }}>V</div>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", letterSpacing:"0.07em" }}>LEGAL DATASET VALIDATOR</div>
          <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.1em", marginTop:1 }}>Single-Hop · Advanced Selection · Null Relevance — EN / BN</div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:14 }}>
          {Object.entries(GM).map(([g, m]) => (
            <span key={g} style={{ fontSize:10, color:"#475569" }}>
              <span style={{ color:m.color, marginRight:3 }}>{m.icon}</span>{m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Grading legend */}
      <div style={{ background:"#0a0f1a", borderBottom:"1px solid #1e293b", padding:"7px 22px", display:"flex", gap:28, fontSize:9, color:"#334155", flexShrink:0, flexWrap:"wrap" }}>
        <span><span style={{color:"#22c55e"}}>✓ Clean</span> = 0 errors, 0 warnings</span>
        <span><span style={{color:"#86efac"}}>✓ Pass</span> = 0 errors, warnings only — <b style={{color:"#86efac"}}>passes</b></span>
        <span><span style={{color:"#ef4444"}}>✗ Fail</span> = 1+ mandatory errors — must fix</span>
        <span style={{ marginLeft:"auto" }}>Warnings are advisory — never affect pass/fail</span>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:0 }}>

        {/* Input */}
        <div style={{ width:"36%", borderRight:"1px solid #1e293b", display:"flex", flexDirection:"column", padding:14, gap:10, flexShrink:0 }}>
          <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.12em" }}>JSON INPUT</div>
          <textarea
            value={input} onChange={e => setInput(e.target.value)}
            placeholder={"Paste generated JSON array here.\n\nAuto-detects type per entry:\n• Single-Hop (EN/BN)\n• Advanced Selection (EN/BN)\n• Null Relevance (EN/BN)\n\nCan mix types in one array."}
            style={{ flex:1, background:"#0d1117", border:"1px solid #1e293b", borderRadius:6, padding:13, color:"#94a3b8", fontSize:11, lineHeight:1.6, resize:"none", outline:"none", fontFamily:"inherit", minHeight:0 }}
            onFocus={e => e.target.style.borderColor="#4f46e5"}
            onBlur={e => e.target.style.borderColor="#1e293b"}
          />
          <button onClick={run} style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", border:"none", borderRadius:6, padding:12, color:"white", fontSize:11, fontWeight:700, letterSpacing:"0.1em", cursor:"pointer", textTransform:"uppercase" }}>
            Run Validation
          </button>
        </div>

        {/* Results */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minHeight:0 }}>
          {!results && <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#1e293b", fontSize:12 }}>Paste JSON · Run Validation</div>}
          {results?.parseError && <div style={{ margin:18, background:"#1c0a0a", border:"1px solid #7f1d1d", borderRadius:8, padding:14, color:"#ef4444", fontSize:12 }}><b>Parse Error:</b> {results.parseError}</div>}

          {results?.er && <>
            {/* Summary */}
            <div style={{ padding:"11px 18px", background:"#0d1117", borderBottom:"1px solid #1e293b", display:"flex", alignItems:"center", gap:2, flexShrink:0, flexWrap:"wrap" }}>
              <SBtn label="All" value={results.total} color="#94a3b8" active={filter==="all"} onClick={() => setFilter("all")} />
              {Object.entries(GM).map(([g, m]) => (
                <SBtn key={g} label={m.label} value={results.gc[g]} color={m.color} active={filter===g} onClick={() => setFilter(g)} />
              ))}
              <div style={{ marginLeft:"auto", fontSize:10, fontWeight:700 }}>
                <span style={{ color: results.gc.fail===0 ? "#22c55e" : "#ef4444" }}>
                  {results.gc.fail===0 ? "✓ 0 failures" : `✗ ${results.gc.fail} failure${results.gc.fail>1?"s":""}`}
                </span>
                <span style={{ color:"#334155", marginLeft:10 }}>
                  {results.gc.clean + results.gc.pass} passing
                </span>
              </div>
            </div>

            {/* Batch warnings */}
            {results.bw.length > 0 && (
              <div style={{ padding:"8px 18px", background:"#120f00", borderBottom:"1px solid #2d2000", flexShrink:0 }}>
                <div style={{ fontSize:9, color:"#f59e0b", letterSpacing:"0.1em", marginBottom:4 }}>BATCH NOTES</div>
                {results.bw.map((w, i) => <div key={i} style={{ fontSize:10, color:"#d97706", marginBottom:2 }}>⚠ {w}</div>)}
              </div>
            )}

            <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
              {/* List */}
              <div style={{ width:185, borderRight:"1px solid #1e293b", overflow:"auto", padding:5, flexShrink:0 }}>
                {filtered.length===0 && <div style={{ padding:10, fontSize:10, color:"#334155", textAlign:"center" }}>No entries</div>}
                {filtered.map(r => {
                  const m = GM[r.grade], isAct = active?.index === r.index;
                  return (
                    <button key={r.index} onClick={() => setActive(r)}
                      style={{ width:"100%", background:isAct?"#1e293b":"transparent", border:`1px solid ${isAct?"#334155":"transparent"}`, borderRadius:5, padding:"6px 8px", cursor:"pointer", textAlign:"left", display:"flex", alignItems:"flex-start", gap:6, marginBottom:2 }}>
                      <span style={{ color:m.color, fontSize:11, fontWeight:"bold", marginTop:1, flexShrink:0 }}>{m.icon}</span>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:10, color:"#e2e8f0", fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>#{r.entryId} {r.sectionNum}</div>
                        <div style={{ fontSize:9, color:TC[r.entryType]||"#64748b", marginTop:1 }}>{TL[r.entryType]}</div>
                        <div style={{ fontSize:9, color:"#475569", marginTop:1 }}>
                          {r.errors.length > 0 && <span style={{color:"#ef4444"}}>{r.errors.length}E </span>}
                          {r.warnings.length > 0 && <span style={{color:"#f59e0b"}}>{r.warnings.length}W</span>}
                          {r.errors.length===0 && r.warnings.length===0 && <span style={{color:"#22c55e"}}>✓</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Detail */}
              <div style={{ flex:1, overflow:"auto", padding:18 }}>
                {active && <EntryDetail r={active} />}
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

function SBtn({ label, value, color, active, onClick }) {
  return (
    <button onClick={onClick} style={{ background:active?"#1e293b":"transparent", border:`1px solid ${active?"#334155":"transparent"}`, borderRadius:5, padding:"5px 11px", cursor:"pointer", marginRight:2, display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
      <div style={{ fontSize:17, fontWeight:700, color, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:8, color:"#475569", letterSpacing:"0.08em", textTransform:"uppercase" }}>{label}</div>
    </button>
  );
}

function EntryDetail({ r }) {
  const m = GM[r.grade];
  const errorCodes = new Set(r.errors.map(e => e.code));
  const warnCodes = new Set(r.warnings.map(w => w.code));
  const list = CHECKS[r.entryType] || [];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Entry header */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:34, height:34, background:m.bg, border:`1px solid ${m.border}`, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:m.color, fontWeight:800, flexShrink:0 }}>{m.icon}</div>
        <div>
          <div style={{ fontSize:13, color:"#f1f5f9", fontWeight:700 }}>Entry #{r.entryId} — {r.sectionNum}</div>
          <div style={{ fontSize:9, color:TC[r.entryType], letterSpacing:"0.1em", textTransform:"uppercase", marginTop:2 }}>{TL[r.entryType]}</div>
        </div>
        <div style={{ marginLeft:"auto", background:m.bg, border:`1px solid ${m.border}`, borderRadius:5, padding:"4px 14px", fontSize:10, color:m.color, fontWeight:700, letterSpacing:"0.05em", display:"flex", alignItems:"center", gap:8 }}>
          {m.label.toUpperCase()}
          {(r.errors.length + r.warnings.length) > 0 && (
            <span style={{ color:"#475569", fontWeight:400, fontSize:9 }}>
              {r.errors.length > 0 && <span style={{color:"#fca5a5"}}>{r.errors.length}E </span>}
              {r.warnings.length > 0 && <span style={{color:"#fcd34d"}}>{r.warnings.length}W</span>}
            </span>
          )}
        </div>
      </div>

      {/* Mandatory errors */}
      {r.errors.length > 0 && (
        <div style={{ background:"#130808", border:"1px solid #7f1d1d", borderRadius:8, padding:14 }}>
          <div style={{ fontSize:9, color:"#ef4444", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:9, fontWeight:700 }}>
            {r.errors.length} Mandatory Error{r.errors.length > 1 ? "s" : ""} — entry fails
          </div>
          {r.errors.map((e, i) => (
            <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:7 }}>
              <span style={{ fontSize:9, color:"#fca5a5", fontWeight:700, background:"#7f1d1d", borderRadius:3, padding:"1px 5px", flexShrink:0, marginTop:1, letterSpacing:"0.04em" }}>{e.code}</span>
              <span style={{ fontSize:11, color:"#fecaca", lineHeight:1.5 }}>{e.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {r.warnings.length > 0 && (
        <div style={{ background:"#120f00", border:"1px solid #78350f", borderRadius:8, padding:14 }}>
          <div style={{ fontSize:9, color:"#f59e0b", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:9, fontWeight:700 }}>
            {r.warnings.length} Advisory Warning{r.warnings.length > 1 ? "s" : ""} — does not affect pass/fail
          </div>
          {r.warnings.map((w, i) => (
            <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:7 }}>
              <span style={{ fontSize:9, color:"#fcd34d", fontWeight:700, background:"#78350f", borderRadius:3, padding:"1px 5px", flexShrink:0, marginTop:1, letterSpacing:"0.04em" }}>{w.code}</span>
              <span style={{ fontSize:11, color:"#fde68a", lineHeight:1.5 }}>{w.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* All clear */}
      {r.errors.length === 0 && r.warnings.length === 0 && (
        <div style={{ background:"#052e16", border:"1px solid #166534", borderRadius:8, padding:14, textAlign:"center", color:"#22c55e", fontSize:11 }}>
          ✓ All checks passed — this entry is clean
        </div>
      )}

      {/* Check grid */}
      <div style={{ background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:14 }}>
        <div style={{ display:"flex", gap:16, marginBottom:10, alignItems:"center" }}>
          <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.12em", textTransform:"uppercase" }}>All Checks</div>
          <div style={{ display:"flex", gap:10, fontSize:9 }}>
            <span style={{ color:"#ef4444" }}>🔴 mandatory</span>
            <span style={{ color:"#f59e0b" }}>🟡 advisory</span>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
          {list.map(({ code, label, kind }) => {
            const isMandatory = kind === "mandatory";
            const failed = isMandatory ? errorCodes.has(code) : warnCodes.has(code);
            const passing = !failed;

            const bg = failed
              ? (isMandatory ? "#130808" : "#1c1500")
              : "#071a12";
            const border = failed
              ? (isMandatory ? "#7f1d1d" : "#78350f")
              : "#14532d";
            const iconColor = failed
              ? (isMandatory ? "#ef4444" : "#f59e0b")
              : "#22c55e";
            const textColor = failed
              ? (isMandatory ? "#fca5a5" : "#fde68a")
              : "#86efac";
            const icon = failed ? (isMandatory ? "✗" : "⚠") : "✓";
            const dot = isMandatory ? "🔴" : "🟡";

            return (
              <div key={code} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 7px", background:bg, border:`1px solid ${border}`, borderRadius:4 }}>
                <span style={{ fontSize:9, flexShrink:0 }}>{dot}</span>
                <span style={{ color:iconColor, fontSize:10, flexShrink:0, fontWeight:"bold" }}>{icon}</span>
                <span style={{ fontSize:9, color:textColor, lineHeight:1.3 }}>[{code}] {label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
