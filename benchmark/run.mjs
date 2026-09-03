import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { classifyComments } from "../src/claudiator.mjs";
import { cases } from "./cases.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runRoot = path.join(root, "benchmark", "runs");
const codeExtensions = new Set([".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".java", ".rb", ".sh", ".css", ".html"]);

function parseArgs(argv) {
  const options = { arms: ["default", "concise", "yagni", "claudiator"], model: "haiku", runs: 3, cases: [], selftest: false, rescore: "", maxCost: Infinity };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--selftest") options.selftest = true;
    else if (value === "--arms") options.arms = argv[++index].split(",");
    else if (value === "--model") options.model = argv[++index];
    else if (value === "--runs") options.runs = Number(argv[++index]);
    else if (value === "--case") options.cases = argv[++index].split(",");
    else if (value === "--rescore") options.rescore = argv[++index];
    else if (value === "--max-cost-usd") options.maxCost = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
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
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    lines: trimmed ? trimmed.split(/\r?\n/).length : 0,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/).length : 0,
    headings: (trimmed.match(/^#{1,6}\s/gm) ?? []).length,
  };
}

function testPatterns(text, patterns = []) {
  return patterns.map((pattern) => ({ pattern: pattern.toString(), pass: pattern.test(text) }));
}

function scoreCase(testCase, workspace, response) {
  const checks = [];
  for (const result of testPatterns(response, testCase.requiredOutput)) checks.push({ check: `output ${result.pattern}`, pass: result.pass });
  for (const result of testPatterns(response, testCase.forbiddenOutput)) checks.push({ check: `output excludes ${result.pattern}`, pass: !result.pass });
  for (const expected of testCase.files ?? []) {
    const target = path.join(workspace, expected.path);
    const exists = fs.existsSync(target);
    checks.push({ check: `${expected.path} exists`, pass: exists });
    const content = exists ? fs.readFileSync(target, "utf8") : "";
    for (const result of testPatterns(content, expected.patterns)) checks.push({ check: `${expected.path} ${result.pattern}`, pass: result.pass });
    for (const result of testPatterns(content, expected.forbidden)) checks.push({ check: `${expected.path} excludes ${result.pattern}`, pass: !result.pass });
  }
  if (testCase.noChanges) checks.push({ check: "repository unchanged", pass: changedFiles(workspace).length === 0 });
  return { pass: checks.every(({ pass }) => pass), checks };
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

function runCell(testCase, arm, runNumber, model, destination) {
  const workspace = path.join(destination, "workspaces", testCase.id, arm, String(runNumber));
  const captureFile = path.join(destination, "messages", `${testCase.id}__${arm}__${runNumber}.jsonl`);
  writeSeed(workspace, testCase.seed);
  const treatment = armArgs(arm);
  const tools = [...new Set(testCase.allowedTools ?? ["Read", "Glob", "Grep"])];
  const args = [
    "-p", testCase.prompt,
    "--output-format", "json",
    "--model", model,
    "--permission-mode", "bypassPermissions",
    "--setting-sources", "project,local",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--allowedTools", ...tools,
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
    arm,
    run: runNumber,
    ...score,
    ...outputMetrics(messages.displayedResponse),
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
    medianWords: median(cells.map(({ words = 0 }) => words)),
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
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function writeReport(destination, metadata, rows) {
  const summary = aggregate(rows);
  fs.writeFileSync(path.join(destination, "aggregate.json"), JSON.stringify({ metadata, summary, rows }, null, 2));
  const rowsFor = (entries, splitCategory = false) => Object.entries(entries).map(([key, value]) => {
    const [category, arm] = splitCategory ? key.split("::") : ["all", key];
    return `<tr><td>${escapeHtml(category)}</td><td>${escapeHtml(arm)}</td><td>${(value.passRate * 100).toFixed(1)}%</td><td>${value.medianWords}</td><td>${value.medianSourceLines}</td><td>${value.medianComments}</td><td>$${value.totalCostUsd.toFixed(4)}</td><td>${value.medianDurationMs}</td></tr>`;
  }).join("");
  const header = "<thead><tr><th>Category</th><th>Arm</th><th>Pass</th><th>Median words</th><th>Median source LOC</th><th>Median comments</th><th>Cost</th><th>Median ms</th></tr></thead>";
  fs.writeFileSync(path.join(destination, "report.html"), `<!doctype html><meta charset="utf-8"><title>Claudiator benchmark</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}</style><h1>Claudiator benchmark</h1><pre>${escapeHtml(JSON.stringify(metadata, null, 2))}</pre><p>Descriptive totals are not a cross-scope ranking. Compare matched categories.</p><h2>By category</h2><table>${header}<tbody>${rowsFor(summary.byCategory, true)}</tbody></table><h2>All executed cells</h2><table>${header}<tbody>${rowsFor(summary.byArm)}</tbody></table>`);
}

function selftest() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claudiator-bench-"));
  writeSeed(workspace, { "a.js": "export const a = 1;\n" });
  const good = scoreCase({ requiredOutput: [/done/], forbiddenOutput: [/certainly/i] }, workspace, "done");
  const bad = scoreCase({ requiredOutput: [/done/], forbiddenOutput: [/certainly/i] }, workspace, "Certainly not done");
  const metrics = outputMetrics("One two\n\nThree");
  const order = seededOrder([1, 2, 3, 4]);
  const summary = aggregate([{ arm: "test", category: "direct", pass: true, words: 3, sourceLines: 1, commentLines: 0, costUsd: 0, durationMs: 2 }]);
  fs.rmSync(workspace, { recursive: true, force: true });
  const checks = [good.pass, !bad.pass, metrics.words === 3, metrics.paragraphs === 2, new Set(order).size === 4, cases.length >= 24, summary.byArm.test.passRate === 1, summary.byCategory["direct::test"].passRate === 1];
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
    return { ...row, ...score, ...outputMetrics(row.response), ...diffStats(workspace) };
  });
  writeReport(directory, { ...prior.metadata, rescoredAt: new Date().toISOString() }, rows);
}

const options = parseArgs(process.argv.slice(2));
if (options.selftest) selftest();
else if (options.rescore) rescore(path.resolve(options.rescore));
else {
  const selected = options.cases.length ? cases.filter(({ id }) => options.cases.includes(id)) : cases;
  if (!selected.length) throw new Error("No benchmark cases selected");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(runRoot, timestamp);
  fs.mkdirSync(destination, { recursive: true });
  const cells = [];
  for (const testCase of selected) {
    for (const arm of options.arms) {
      if (arm === "ponytail" && !["coding", "comments", "no-op"].includes(testCase.category)) continue;
      for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) cells.push({ testCase, arm, runNumber });
    }
  }
  const ordered = seededOrder(cells);
  const rows = [];
  let cost = 0;
  for (const cell of ordered) {
    if (cost >= options.maxCost) break;
    process.stdout.write(`${cell.testCase.id} ${cell.arm} run ${cell.runNumber}\n`);
    const result = runCell(cell.testCase, cell.arm, cell.runNumber, options.model, destination);
    rows.push(result);
    cost += result.costUsd ?? 0;
  }
  const version = run("claude", ["--version"], root).stdout.trim();
  writeReport(destination, { createdAt: new Date().toISOString(), claudeVersion: version, model: options.model, arms: options.arms, runs: options.runs, requestedCells: cells.length, completedCells: rows.length }, rows);
  process.stdout.write(`${destination}\n`);
}
