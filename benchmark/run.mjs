import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { classifyComments } from "../src/claudiator.mjs";
import { cases, microSuites } from "./cases.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runRoot = path.join(root, "benchmark", "runs");
const codeExtensions = new Set([".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".java", ".rb", ".sh", ".css", ".html"]);
const pilotCases = ["direct-command", "direct-definition", "coding-dedupe", "comment-kubebuilder", "comment-existing-todo", "docs-install", "ui-delete-button", "deep-sql", "safety-secret"];
const pilotArms = ["default", "concise", "yagni", "ponytail", "claudiator"];

function parseArgs(argv) {
  const options = { arms: ["default", "concise", "yagni", "claudiator"], model: "haiku", runs: 3, cases: [], suite: "", selftest: false, pilot: false, dryRun: false, rescore: "", resume: "", maxCost: 0.5 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--selftest") options.selftest = true;
    else if (value === "--pilot") options.pilot = true;
    else if (value === "--dry-run") options.dryRun = true;
    else if (value === "--arms") options.arms = argv[++index].split(",");
    else if (value === "--model") options.model = argv[++index];
    else if (value === "--runs") options.runs = Number(argv[++index]);
    else if (value === "--case") options.cases = argv[++index].split(",");
    else if (value === "--suite") options.suite = argv[++index];
    else if (value === "--rescore") options.rescore = argv[++index];
    else if (value === "--resume") options.resume = argv[++index];
    else if (value === "--max-cost-usd") options.maxCost = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (options.pilot) {
    options.arms = pilotArms;
    options.cases = pilotCases;
    options.runs = 1;
    options.maxCost = Math.min(options.maxCost, 0.75);
  }
  if (options.suite && !microSuites[options.suite]) throw new Error(`Unknown suite: ${options.suite}`);
  if (options.suite && options.cases.length) throw new Error("Use either --suite or --case, not both");
  return options;
}

function run(command, args, cwd, env = process.env) {
  return spawnSync(command, args, { cwd, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function writeSeed(workspace, seed = {}) {
  fs.mkdirSync(workspace, { recursive: true });
  for (const [name, content] of Object.entries(seed)) {
    const target = path.join(workspace, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  run("git", ["init", "-q"], workspace);
  run("git", ["add", "-A"], workspace);
  run("git", ["-c", "user.name=Claudiator Eval", "-c", "user.email=eval@local", "commit", "-qm", "seed", "--no-verify", "--allow-empty"], workspace);
}

function changedFiles(workspace) {
  run("git", ["add", "-A"], workspace);
  const result = run("git", ["diff", "--cached", "--name-only", "HEAD"], workspace);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function diffStats(workspace) {
  const names = changedFiles(workspace);
  let sourceFiles = 0;
  let sourceLines = 0;
  let commentLines = 0;
  let narrativeComments = 0;
  let protectedComments = 0;
  for (const name of names) {
    if (!codeExtensions.has(path.extname(name))) continue;
    sourceFiles += 1;
    const target = path.join(workspace, name);
    if (!fs.existsSync(target)) continue;
    const content = fs.readFileSync(target, "utf8");
    sourceLines += content.split(/\r?\n/).filter((line) => line.trim()).length;
    const comments = classifyComments(content, path.extname(name).slice(1));
    commentLines += comments.length;
    narrativeComments += comments.filter(({ kind }) => ["narrative", "history", "commented-code"].includes(kind)).length;
    protectedComments += comments.filter(({ kind }) => kind === "protected").length;
  }
  return { changedFiles: names.length, sourceFiles, sourceLines, commentLines, narrativeComments, protectedComments };
}

function repositoryDiff(workspace) {
  changedFiles(workspace);
  return run("git", ["diff", "--cached", "--binary", "HEAD"], workspace).stdout;
}

function outputMetrics(text) {
  const trimmed = String(text ?? "").trim();
  const visible = trimmed
    .split(/\r?\n/)
    .filter((line) => !/^\s*```[^`]*$/.test(line))
    .map((line) => line.replace(/^\s*(?:#{1,6}|[-*+]|\d+\.)\s+/, ""))
    .join("\n")
    .trim();
  return {
    words: visible ? visible.split(/\s+/).length : 0,
    lines: trimmed ? trimmed.split(/\r?\n/).length : 0,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/).length : 0,
    headings: (trimmed.match(/^#{1,6}\s/gm) ?? []).length,
  };
}

function testPatterns(text, patterns = []) {
  return patterns.map((pattern) => ({ pattern: pattern.toString(), pass: pattern.test(text) }));
}

function testJavascript(content, spec) {
  const program = `
    const [source, specification] = process.argv.slice(1);
    const module = await import("data:text/javascript;base64," + source);
    const config = JSON.parse(specification);
    const fn = module[config.export];
    if (typeof fn !== "function") process.exit(2);
    for (const test of config.calls ?? []) {
      if (!Object.is(fn(...test.args), test.equals)) process.exit(3);
    }
    for (const test of config.throws ?? []) {
      try { fn(...test.args); process.exit(4); }
      catch (error) { if (error?.name !== test.name) process.exit(5); }
    }
  `;
  const result = run(process.execPath, ["--input-type=module", "-e", program, Buffer.from(content).toString("base64"), JSON.stringify(spec)], root);
  return { pass: result.status === 0, error: result.stderr.trim() || `exit ${result.status}` };
}

function scoreCase(testCase, workspace, response) {
  const checks = [];
  const add = (check, pass, dimension) => checks.push({ check, pass, dimension });
  const output = outputMetrics(response);
  for (const result of testPatterns(response, testCase.requiredOutput)) add(`output ${result.pattern}`, result.pass, "content");
  for (const alternatives of testCase.requiredAnyOutput ?? []) {
    const results = testPatterns(response, alternatives);
    add(`output matches any of ${results.map(({ pattern }) => pattern).join(", ")}`, results.some(({ pass }) => pass), "content");
  }
  for (const result of testPatterns(response, testCase.forbiddenOutput)) add(`output excludes ${result.pattern}`, !result.pass, "presentation");
  if (testCase.exactOutput !== undefined) add(`output is exactly ${JSON.stringify(testCase.exactOutput)}`, String(response).trim() === testCase.exactOutput, "presentation");
  if (testCase.maxWords !== undefined) add(`output has at most ${testCase.maxWords} words`, output.words <= testCase.maxWords, "presentation");
  if (testCase.minWords !== undefined) add(`output has at least ${testCase.minWords} words`, output.words >= testCase.minWords, "content");
  if (testCase.maxLines !== undefined) add(`output has at most ${testCase.maxLines} lines`, output.lines <= testCase.maxLines, "presentation");
  for (const expected of testCase.files ?? []) {
    const target = path.join(workspace, expected.path);
    const exists = fs.existsSync(target);
    add(`${expected.path} exists`, exists, "content");
    const content = exists ? fs.readFileSync(target, "utf8") : "";
    const nonEmptyLines = content.split(/\r?\n/).filter((line) => line.trim()).length;
    const comments = classifyComments(content, path.extname(expected.path).slice(1));
    for (const result of testPatterns(content, expected.patterns)) add(`${expected.path} ${result.pattern}`, result.pass, "content");
    if (exists && expected.javascript) {
      const result = testJavascript(content, expected.javascript);
      add(`${expected.path} executable JavaScript contract${result.pass ? "" : ` (${result.error})`}`, result.pass, "content");
    }
    for (const result of testPatterns(content, expected.forbidden)) add(`${expected.path} excludes ${result.pattern}`, !result.pass, "presentation");
    if (expected.maxLines !== undefined) add(`${expected.path} has at most ${expected.maxLines} non-empty lines`, nonEmptyLines <= expected.maxLines, "presentation");
    if (expected.maxComments !== undefined) add(`${expected.path} has at most ${expected.maxComments} comments`, comments.length <= expected.maxComments, "presentation");
  }
  if (testCase.maxChangedFiles !== undefined) add(`repository changes at most ${testCase.maxChangedFiles} files`, changedFiles(workspace).length <= testCase.maxChangedFiles, "presentation");
  if (testCase.noChanges) add("repository unchanged", changedFiles(workspace).length === 0, "content");
  const contentPass = checks.filter(({ dimension }) => dimension === "content").every(({ pass }) => pass);
  const presentationPass = checks.filter(({ dimension }) => dimension === "presentation").every(({ pass }) => pass);
  return { pass: contentPass && presentationPass, contentPass, presentationPass, checks };
}

function resolvePonytail() {
  if (process.env.PONYTAIL_PLUGIN_DIR) return process.env.PONYTAIL_PLUGIN_DIR;
  const base = path.join(os.homedir(), ".claude", "plugins", "cache", "ponytail", "ponytail");
  if (!fs.existsSync(base)) throw new Error("Ponytail is not installed; set PONYTAIL_PLUGIN_DIR");
  const versions = fs.readdirSync(base).filter((name) => fs.statSync(path.join(base, name)).isDirectory()).sort();
  if (!versions.length) throw new Error("No Ponytail plugin version found");
  return path.join(base, versions.at(-1));
}

function armArgs(arm) {
  if (arm === "default") return { args: [], env: {} };
  if (arm === "concise") return { args: ["--settings", JSON.stringify({ outputStyle: "Concise" })], env: {} };
  if (arm === "yagni") return { args: ["--append-system-prompt", "Be concise. Follow YAGNI. Prefer the smallest correct solution and add no unnecessary prose or comments."], env: {} };
  if (arm === "ponytail") return { args: ["--plugin-dir", resolvePonytail()], env: {} };
  if (arm === "claudiator") return { args: ["--plugin-dir", root], env: {} };
  if (arm === "claudiator-semantic") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for claudiator-semantic");
    return {
      args: ["--plugin-dir", root],
      env: {
        CLAUDE_PLUGIN_OPTION_SEMANTIC_RENDERER: "true",
        CLAUDE_PLUGIN_OPTION_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    };
  }
  throw new Error(`Unknown arm: ${arm}`);
}

function parseClaudeJson(stdout) {
  const body = JSON.parse(stdout);
  return {
    response: body.result ?? body.response ?? "",
    costUsd: body.total_cost_usd ?? body.cost_usd ?? 0,
    durationMs: body.duration_ms ?? 0,
    turns: body.num_turns ?? 0,
    usage: body.usage ?? {},
    sessionId: body.session_id,
    isError: Boolean(body.is_error),
    error: body.is_error ? body.result || body.terminal_reason || "Claude returned an error" : "",
  };
}

function capturedMessage(file, fallback) {
  if (!fs.existsSync(file)) return { rawResponse: fallback, displayedResponse: fallback };
  const records = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const ordered = [...records].sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
  const rawResponse = ordered.map(({ raw }) => raw ?? "").join("") || fallback;
  const final = ordered.findLast(({ final }) => final);
  const displayedResponse = final?.displayed || ordered.map(({ displayed }) => displayed ?? "").join("") || fallback;
  return { rawResponse, displayedResponse };
}

function toolArgs(allowedTools) {
  const tools = [...new Set(allowedTools ?? ["Read", "Glob", "Grep"])];
  return tools.length ? ["--allowedTools", ...tools] : ["--tools", ""];
}

function runCell(testCase, arm, runNumber, model, destination) {
  const workspace = path.join(destination, "workspaces", testCase.id, arm, String(runNumber));
  const captureFile = path.join(destination, "messages", `${testCase.id}__${arm}__${runNumber}.jsonl`);
  writeSeed(workspace, testCase.seed);
  const treatment = armArgs(arm);
  const args = [
    "-p", testCase.prompt,
    "--output-format", "json",
    "--model", model,
    "--permission-mode", "bypassPermissions",
    "--setting-sources", "project,local",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
    ...toolArgs(testCase.allowedTools),
    "--disallowedTools", "Bash", "PowerShell", "WebFetch", "WebSearch",
    ...treatment.args,
  ];
  const started = Date.now();
  const benchmarkEnv = {
    ...process.env,
    ...treatment.env,
    ...(arm.startsWith("claudiator") ? { CLAUDIATOR_BENCHMARK_CAPTURE_FILE: captureFile } : {}),
  };
  const child = run("claude", args, workspace, benchmarkEnv);
  const rawFile = path.join(destination, "raw", `${testCase.id}__${arm}__${runNumber}.json`);
  fs.mkdirSync(path.dirname(rawFile), { recursive: true });
  fs.writeFileSync(rawFile, child.stdout || JSON.stringify({ error: child.stderr, status: child.status }));
  if (child.status !== 0) {
    let error = child.stderr.trim();
    try {
      error ||= parseClaudeJson(child.stdout).error;
    } catch {}
    return { case: testCase.id, category: testCase.category, arm, run: runNumber, pass: false, error: error || `Claude exited ${child.status}`, wallMs: Date.now() - started };
  }
  const parsed = parseClaudeJson(child.stdout);
  if (parsed.isError) {
    return { case: testCase.id, category: testCase.category, arm, run: runNumber, pass: false, error: parsed.error, wallMs: Date.now() - started };
  }
  const messages = capturedMessage(captureFile, parsed.response);
  const score = scoreCase(testCase, workspace, messages.displayedResponse);
  const diffFile = path.join(destination, "diffs", `${testCase.id}__${arm}__${runNumber}.patch`);
  fs.mkdirSync(path.dirname(diffFile), { recursive: true });
  fs.writeFileSync(diffFile, repositoryDiff(workspace));
  return {
    case: testCase.id,
    category: testCase.category,
    reducible: testCase.reducible,
    arm,
    run: runNumber,
    ...score,
    ...outputMetrics(messages.displayedResponse),
    rawWords: outputMetrics(messages.rawResponse).words,
    rawLines: outputMetrics(messages.rawResponse).lines,
    ...diffStats(workspace),
    costUsd: parsed.costUsd,
    durationMs: parsed.durationMs,
    wallMs: Date.now() - started,
    turns: parsed.turns,
    usage: parsed.usage,
    response: messages.displayedResponse,
    rawResponse: messages.rawResponse,
    displayedResponse: messages.displayedResponse,
    cliResponse: parsed.response,
    diffFile: path.relative(destination, diffFile),
  };
}

function seededOrder(items, seed = 0xC1A0D1A7) {
  let state = seed >>> 0;
  const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function balancedOrder(cells) {
  const groups = [...new Set(cells.map(({ testCase, runNumber }) => `${testCase.id}:${runNumber}`))];
  const groupOrder = seededOrder(groups);
  const ordered = [];
  const stages = [["default", "claudiator"], ["concise"], ["yagni"], ["ponytail"], ["claudiator-semantic"]];
  for (const arms of stages) {
    for (const groupId of groupOrder) {
      const group = seededOrder(cells.filter(({ testCase, runNumber, arm }) => `${testCase.id}:${runNumber}` === groupId && arms.includes(arm)));
      ordered.push(...group.map((cell) => ({ ...cell, budgetGroup: `${groupId}:${arms.join("+")}` })));
    }
  }
  return ordered;
}

function cellKey(cell) {
  return `${cell.case ?? cell.testCase.id}:${cell.arm}:${cell.run ?? cell.runNumber}`;
}

function caseFingerprint(selected) {
  const json = JSON.stringify(selected, (_key, value) => value instanceof RegExp ? value.toString() : value);
  return crypto.createHash("sha256").update(json).digest("hex");
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(rows, keyFor) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Object.fromEntries([...groups].map(([key, cells]) => [key, {
    cells: cells.length,
    passRate: cells.filter(({ pass }) => pass).length / cells.length,
    contentPassRate: cells.filter(({ contentPass }) => contentPass).length / cells.length,
    presentationPassRate: cells.filter(({ presentationPass }) => presentationPass).length / cells.length,
    medianWords: median(cells.map(({ words = 0 }) => words)),
    medianRawWords: median(cells.map(({ rawWords, words = 0 }) => rawWords ?? words)),
    medianSourceLines: median(cells.map(({ sourceLines = 0 }) => sourceLines)),
    medianComments: median(cells.map(({ commentLines = 0 }) => commentLines)),
    totalCostUsd: cells.reduce((sum, { costUsd = 0 }) => sum + costUsd, 0),
    medianDurationMs: median(cells.map(({ durationMs = 0 }) => durationMs)),
  }]));
}

function aggregate(rows) {
  return {
    byArm: summarize(rows, ({ arm }) => arm),
    byCategory: summarize(rows, ({ arm, category }) => `${category}::${arm}`),
    pairedVsDefault: pairedComparisons(rows, "default"),
    pairedVsConcise: pairedComparisons(rows, "concise"),
  };
}

function pairedComparisons(rows, baselineArm) {
  const usable = rows.filter(({ error }) => !error);
  const baselines = new Map(usable.filter(({ arm }) => arm === baselineArm).map((row) => [`${row.case}:${row.run}`, row]));
  const arms = [...new Set(usable.map(({ arm }) => arm))].filter((arm) => arm !== baselineArm);
  return Object.fromEntries(arms.map((arm) => {
    const pairs = usable.filter((row) => row.arm === arm && baselines.has(`${row.case}:${row.run}`)).map((row) => [baselines.get(`${row.case}:${row.run}`), row]);
    const reducible = pairs.filter(([, treatment]) => treatment.reducible);
    return [arm, {
      pairs: pairs.length,
      reduciblePairs: reducible.length,
      baselinePassRate: pairs.length ? pairs.filter(([baseline]) => baseline.pass).length / pairs.length : 0,
      armPassRate: pairs.length ? pairs.filter(([, treatment]) => treatment.pass).length / pairs.length : 0,
      medianWordDelta: median(pairs.map(([baseline, treatment]) => treatment.words - baseline.words)),
      medianWordReductionPct: median(pairs.filter(([baseline]) => baseline.words > 0).map(([baseline, treatment]) => 100 * (baseline.words - treatment.words) / baseline.words)),
      medianReducibleWordReductionPct: median(reducible.filter(([baseline]) => baseline.words > 0).map(([baseline, treatment]) => 100 * (baseline.words - treatment.words) / baseline.words)),
    }];
  }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function writeReport(destination, metadata, rows) {
  const summary = aggregate(rows);
  fs.writeFileSync(path.join(destination, "aggregate.json"), JSON.stringify({ metadata, summary, rows }, null, 2));
  const rowsFor = (entries, splitCategory = false) => Object.entries(entries).map(([key, value]) => {
    const [category, arm] = splitCategory ? key.split("::") : ["all", key];
    return `<tr><td>${escapeHtml(category)}</td><td>${escapeHtml(arm)}</td><td>${(value.passRate * 100).toFixed(1)}%</td><td>${(value.contentPassRate * 100).toFixed(1)}%</td><td>${(value.presentationPassRate * 100).toFixed(1)}%</td><td>${value.medianWords}</td><td>${value.medianRawWords}</td><td>${value.medianSourceLines}</td><td>${value.medianComments}</td><td>$${value.totalCostUsd.toFixed(4)}</td><td>${value.medianDurationMs}</td></tr>`;
  }).join("");
  const header = "<thead><tr><th>Category</th><th>Arm</th><th>Pass</th><th>Content</th><th>Presentation</th><th>Median words</th><th>Median raw words</th><th>Median source LOC</th><th>Median comments</th><th>Cost</th><th>Median ms</th></tr></thead>";
  const pairedHeader = "<thead><tr><th>Arm</th><th>Matched pairs</th><th>Baseline pass</th><th>Arm pass</th><th>Median word delta</th><th>Median reduction</th><th>Reducible pairs</th><th>Reducible reduction</th></tr></thead>";
  const pairedRows = (entries) => Object.entries(entries).map(([arm, value]) => `<tr><td>${escapeHtml(arm)}</td><td>${value.pairs}</td><td>${(value.baselinePassRate * 100).toFixed(1)}%</td><td>${(value.armPassRate * 100).toFixed(1)}%</td><td>${value.medianWordDelta}</td><td>${value.medianWordReductionPct.toFixed(1)}%</td><td>${value.reduciblePairs}</td><td>${value.medianReducibleWordReductionPct.toFixed(1)}%</td></tr>`).join("");
  fs.writeFileSync(path.join(destination, "report.html"), `<!doctype html><meta charset="utf-8"><title>Claudiator benchmark</title><style>body{font:16px system-ui;max-width:1200px;margin:40px auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}</style><h1>Claudiator benchmark</h1><pre>${escapeHtml(JSON.stringify(metadata, null, 2))}</pre><p>Only matched pairs support cross-arm comparisons. Category and all-cell totals are descriptive.</p><h2>Paired with Default</h2><table>${pairedHeader}<tbody>${pairedRows(summary.pairedVsDefault)}</tbody></table><h2>Paired with Concise</h2><table>${pairedHeader}<tbody>${pairedRows(summary.pairedVsConcise)}</tbody></table><h2>By category</h2><table>${header}<tbody>${rowsFor(summary.byCategory, true)}</tbody></table><h2>All executed cells</h2><table>${header}<tbody>${rowsFor(summary.byArm)}</tbody></table>`);
}

function selftest() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claudiator-bench-"));
  writeSeed(workspace, { "a.js": "export const a = 1;\n", "clamp.js": "export const clamp = (value, min, max) => { if (min > max) throw new RangeError(); return Math.max(min, Math.min(value, max)); };\n" });
  const good = scoreCase({ requiredOutput: [/done/], forbiddenOutput: [/certainly/i] }, workspace, "done");
  const bad = scoreCase({ requiredOutput: [/done/], forbiddenOutput: [/certainly/i] }, workspace, "Certainly not done");
  const strictGood = scoreCase({ exactOutput: "done", maxWords: 1, maxLines: 1 }, workspace, "done");
  const strictBad = scoreCase({ exactOutput: "done", maxWords: 1, maxLines: 1 }, workspace, "done with extra prose");
  const depthGood = scoreCase({ minWords: 3 }, workspace, "one two three");
  const depthBad = scoreCase({ minWords: 3 }, workspace, "too short");
  const equivalent = scoreCase({ requiredAnyOutput: [[/git status --short/, /git status -s/]], maxWords: 3 }, workspace, "```sh\ngit status -s\n```");
  const mixed = scoreCase({ requiredOutput: [/done/], maxWords: 1 }, workspace, "done eventually");
  const executable = scoreCase({ files: [{ path: "clamp.js", javascript: { export: "clamp", calls: [{ args: [5, 0, 10], equals: 5 }, { args: [-1, 0, 10], equals: 0 }, { args: [11, 0, 10], equals: 10 }], throws: [{ args: [1, 2, 0], name: "RangeError" }] } }] }, workspace, "done");
  const brokenExecutable = scoreCase({ files: [{ path: "a.js", javascript: { export: "a", calls: [{ args: [], equals: 1 }] } }] }, workspace, "done");
  const metrics = outputMetrics("One two\n\nThree");
  const fencedMetrics = outputMetrics("```sh\ngit status -s\n```");
  const order = seededOrder([1, 2, 3, 4]);
  const orderedCells = balancedOrder([
    { testCase: { id: "a" }, arm: "default", runNumber: 1 },
    { testCase: { id: "a" }, arm: "claudiator", runNumber: 1 },
    { testCase: { id: "a" }, arm: "concise", runNumber: 1 },
  ]);
  const summary = aggregate([
    { case: "paired", run: 1, arm: "default", category: "direct", pass: true, words: 10, sourceLines: 0, commentLines: 0, costUsd: 0, durationMs: 2 },
    { case: "paired", run: 1, arm: "claudiator", category: "direct", reducible: true, pass: true, words: 5, sourceLines: 0, commentLines: 0, costUsd: 0, durationMs: 2 },
    { case: "paired", run: 1, arm: "concise", category: "direct", reducible: true, pass: true, words: 8, sourceLines: 0, commentLines: 0, costUsd: 0, durationMs: 2 },
    { case: "unpaired", run: 1, arm: "claudiator", category: "direct", pass: true, words: 1, sourceLines: 0, commentLines: 0, costUsd: 0, durationMs: 2 },
  ]);
  const holdout = cases.filter(({ suite }) => suite === "micro-holdout");
  const independentHoldout = cases.filter(({ suite }) => suite === "independent-holdout");
  const lockedDigest = fs.readFileSync(path.join(root, "benchmark", "micro-holdout.sha256"), "utf8").trim();
  const independentDigest = fs.readFileSync(path.join(root, "benchmark", "independent-holdout.sha256"), "utf8").trim();
  fs.rmSync(workspace, { recursive: true, force: true });
  const checks = [good.pass, !bad.pass, strictGood.pass, !strictBad.pass, depthGood.pass, !depthBad.pass, equivalent.pass, mixed.contentPass && !mixed.presentationPass && !mixed.pass, executable.pass, !brokenExecutable.pass, metrics.words === 3, metrics.paragraphs === 2, fencedMetrics.words === 3, fencedMetrics.lines === 3, new Set(order).size === 4, orderedCells.slice(0, 2).every(({ budgetGroup }) => budgetGroup === "a:1:default+claudiator"), orderedCells.at(-1).arm === "concise", JSON.stringify(toolArgs([])) === JSON.stringify(["--tools", ""]), JSON.stringify(toolArgs(["Read", "Read"])) === JSON.stringify(["--allowedTools", "Read"]), cases.length >= 54, new Set(cases.map(({ id }) => id)).size === cases.length, pilotCases.length === 9, microSuites["micro-train"].length === 6, microSuites["micro-next-train"].length === 6, microSuites["natural-train"].length === 6, holdout.length === 6, caseFingerprint(holdout) === lockedDigest, independentHoldout.length === 6, caseFingerprint(independentHoldout) === independentDigest, summary.pairedVsDefault.claudiator.pairs === 1, summary.pairedVsDefault.claudiator.reduciblePairs === 1, summary.pairedVsDefault.claudiator.medianReducibleWordReductionPct === 50, summary.pairedVsConcise.claudiator.medianReducibleWordReductionPct === 37.5];
  if (checks.some((pass) => !pass)) throw new Error(`Benchmark self-test failed: ${JSON.stringify(checks)}`);
  process.stdout.write(`benchmark self-test: ${checks.length} checks passed; ${cases.length} cases\n`);
}

function rescore(directory) {
  const aggregateFile = path.join(directory, "aggregate.json");
  const prior = JSON.parse(fs.readFileSync(aggregateFile, "utf8"));
  const rows = prior.rows.map((row) => {
    const testCase = cases.find(({ id }) => id === row.case);
    const workspace = path.join(directory, "workspaces", row.case, row.arm, String(row.run));
    const score = scoreCase(testCase, workspace, row.response);
    return { ...row, reducible: testCase.reducible, ...score, ...outputMetrics(row.response), ...diffStats(workspace) };
  });
  writeReport(directory, { ...prior.metadata, rescoredAt: new Date().toISOString() }, rows);
}

const options = parseArgs(process.argv.slice(2));
if (options.selftest) selftest();
else if (options.rescore) rescore(path.resolve(options.rescore));
else {
  const selectedIds = options.suite ? microSuites[options.suite] : options.cases;
  const selected = selectedIds.length ? cases.filter(({ id }) => selectedIds.includes(id)) : cases.filter(({ suite }) => !suite);
  if (!selected.length) throw new Error("No benchmark cases selected");
  const cells = [];
  for (const testCase of selected) {
    for (const arm of options.arms) {
      if (arm === "ponytail" && !["coding", "comments", "no-op"].includes(testCase.category)) continue;
      for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) cells.push({ testCase, arm, runNumber });
    }
  }
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({ cases: selected.map(({ id }) => id), arms: options.arms, runs: options.runs, cells: cells.length, maxCostUsd: options.maxCost }, null, 2)}\n`);
    process.exit(0);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = options.resume ? path.resolve(options.resume) : path.join(runRoot, timestamp);
  fs.mkdirSync(destination, { recursive: true });
  const priorFile = path.join(destination, "aggregate.json");
  const prior = options.resume ? JSON.parse(fs.readFileSync(priorFile, "utf8")) : null;
  const fingerprint = caseFingerprint(selected);
  if (prior && (prior.metadata.model !== options.model || prior.metadata.caseFingerprint !== fingerprint || JSON.stringify(prior.metadata.arms) !== JSON.stringify(options.arms) || prior.metadata.runs !== options.runs)) throw new Error("Resume options do not match the original run");
  const rows = prior?.rows ?? [];
  const completed = new Set(rows.map(cellKey));
  const ordered = balancedOrder(cells).filter((cell) => !completed.has(cellKey(cell)));
  let cost = 0;
  let budgetGroup;
  for (const cell of ordered) {
    if (cost >= options.maxCost && cell.budgetGroup !== budgetGroup) break;
    budgetGroup = cell.budgetGroup;
    process.stdout.write(`${cell.testCase.id} ${cell.arm} run ${cell.runNumber}\n`);
    const result = runCell(cell.testCase, cell.arm, cell.runNumber, options.model, destination);
    rows.push(result);
    cost += result.costUsd ?? 0;
  }
  const version = run("claude", ["--version"], root).stdout.trim();
  writeReport(destination, { createdAt: prior?.metadata.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), claudeVersion: version, model: options.model, suite: options.suite || null, arms: options.arms, runs: options.runs, maxCostUsd: options.maxCost, caseFingerprint: fingerprint, requestedCells: cells.length, completedCells: rows.length, complete: rows.length === cells.length }, rows);
  process.stdout.write(`${destination}\n`);
}
