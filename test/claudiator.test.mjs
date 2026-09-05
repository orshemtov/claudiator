import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  anthropicSemanticCompress,
  classifyComments,
  compress,
  deriveContract,
  extractProtected,
  handleHook,
  inspectArtifact,
  verifyPreservation,
} from "../src/claudiator.mjs";

test("deriveContract selects terminal-friendly structure and honors requested depth", async () => {
  assert.equal(deriveContract("Compare these three options").representation, "table");
  assert.equal(deriveContract("Show the request flow in Claude Code").representation, "ascii");
  assert.equal(deriveContract("Explain this thoroughly").depth, "detailed");
  assert.equal(deriveContract("Fix the typo").depth, "minimum");
  assert.equal(deriveContract("Give only the single command").strict, true);
  assert.equal(deriveContract("State the immediate action compactly").strict, true);
  assert.equal(deriveContract("State the immediate action compactly").wordLimit, 12);
  assert.equal(deriveContract("State only the immediate security action").shape, "single-action");
  assert.equal(deriveContract("State only the immediate security action").wordLimit, 12);
  assert.equal(deriveContract("Give the command and the necessary warning. Add nothing else.").shape, "command-warning");
  assert.equal(deriveContract("Give the command and the necessary warning. Add nothing else.").wordLimit, 16);
  assert.equal(deriveContract("Provide `docker system prune -a` with only its necessary warning.").shape, "command-warning");
  assert.equal(deriveContract("Define idempotency in one sentence.").shape, "single-sentence-definition");
  assert.equal(deriveContract("Explain thoroughly and define the term in one sentence.").shape, "default");
  assert.deepEqual(
    { shape: deriveContract("A batch processed 148 records and rejected 23. How many were accepted?").shape, limit: deriveContract("A batch processed 148 records and rejected 23. How many were accepted?").wordLimit },
    { shape: "direct-answer", limit: 4 },
  );
  assert.equal(deriveContract("Draft an internal status update for engineers and support.").shape, "status-update");
  assert.equal(deriveContract("Please make sure telemetry is disabled in settings.json.").shape, "change-result");
  assert.equal(deriveContract("Add a small JavaScript utility named clamp.js.").shape, "implementation-result");
  assert.equal(deriveContract("Add a small JavaScript utility named clamp.js.").artifactMaxLines, 10);
  const cleanup = deriveContract("Delete regular files older than 7 days under /var/log/app without crossing filesystem boundaries.");
  assert.equal(cleanup.shape, "bounded-cleanup-command");
  assert.equal(cleanup.wordLimit, 30);
  assert.equal(cleanup.ageDays, 7);
  assert.equal(deriveContract("Delete .tmp files older than 10 days under /var/cache/comet.").filePattern, "*.tmp");
  const destructive = deriveContract("Permanently remove /srv/app/build-cache and its nested contents. What shell commands should I use?");
  assert.equal(destructive.shape, "destructive-command");
  assert.equal(destructive.target, "/srv/app/build-cache");
  assert.equal(deriveContract("Give me a detailed explanation of HTTP caching.").wordLimit, 350);
  assert.equal(deriveContract("Give me a detailed 800-word explanation of HTTP caching.").wordLimit, 800);
  assert.equal(deriveContract("Write a detailed 180-220 word explanation.").wordLimit, 220);
  assert.equal(deriveContract("What is causing intermittent data loss in this distributed system?").shape, "default");
  const destructiveHook = await handleHook({ hook_event_name: "UserPromptSubmit", prompt: "Permanently remove /srv/app/build-cache." });
  assert.match(destructiveHook.hookSpecificOutput.additionalContext, /realpath -- TARGET/);
  assert.match(destructiveHook.hookSpecificOutput.additionalContext, /never add sudo/i);
  const detailedHook = await handleHook({ hook_event_name: "UserPromptSubmit", prompt: "Give me a deep technical comparison." });
  assert.match(detailedHook.hookSpecificOutput.additionalContext, /do not invent/i);
});

test("classifyComments protects tooling and rejects narration", () => {
  const source = [
    "#!/usr/bin/env bash",
    "// +kubebuilder:validation:Minimum=1",
    "//go:generate stringer -type=Status",
    "// eslint-disable-next-line no-console",
    "// TODO(PROJ-42): remove after upstream release",
    "// Increment the counter by one",
    "count += 1",
    "// We used to call the old service here",
  ].join("\n");

  const comments = classifyComments(source, "go");
  assert.deepEqual(
    comments.map(({ kind }) => kind),
    ["protected", "protected", "protected", "protected", "tracking", "narrative", "history"],
  );
});

test("file-backed message store preserves numeric chunk order", async () => {
  const { createFileStore } = await import("../src/claudiator.mjs");
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudiator-store-"));
  const store = createFileStore(dataDir);
  store.append("session_message", 10, "ten");
  store.append("session_message", 2, "two");
  store.append("session_message", 1, "one");
  assert.equal(store.consume("session_message"), "onetwoten");
  store.saveContract("session", { shape: "single-action", wordLimit: 12 });
  assert.deepEqual(store.loadContract("session"), { shape: "single-action", wordLimit: 12 });
  store.cleanupSession("session");
  assert.equal(store.loadContract("session"), undefined);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("artifact gate preserves meaningful markers and blocks obvious comment bloat", () => {
  const safe = inspectArtifact({
    tool_name: "Write",
    tool_input: {
      file_path: "/repo/api.go",
      content: "// +kubebuilder:validation:Minimum=1\ntype Count int\n",
    },
  });
  assert.equal(safe.allow, true);

  const bloated = inspectArtifact({
    tool_name: "Write",
    tool_input: {
      file_path: "/repo/counter.js",
      content: "// Increment the counter by one\ncount += 1;\n",
    },
  });
  assert.equal(bloated.allow, false);
  assert.match(bloated.reason, /narrat/i);
});

test("artifact gate rejects vertical sprawl only for contracted tiny artifacts", () => {
  const content = [
    "function initials(name) {",
    "  if (typeof name !== 'string') {",
    "    throw new TypeError();",
    "  }",
    "  const clean = name.trim();",
    "  if (!clean) {",
    "    return '';",
    "  }",
    "  return clean.split(/\\s+/)",
    "    .map((part) => part[0].toUpperCase())",
    "    .join('');",
    "}",
    "module.exports = { initials };",
  ].join("\n");
  assert.equal(inspectArtifact({ tool_name: "Write", tool_input: { file_path: "/repo/initials.js", content } }, { artifactMaxLines: 10 }).allow, false);
  assert.equal(inspectArtifact({ tool_name: "Write", tool_input: { file_path: "/repo/initials.js", content } }).allow, true);
});

test("artifact gate does not mistake preserved existing TODOs for new comments", () => {
  const decision = inspectArtifact({
    tool_name: "Edit",
    tool_input: {
      file_path: "/repo/service.ts",
      old_string: "// TODO(PROJ-42): remove after upstream release\ncallLegacy();",
      new_string: "// TODO(PROJ-42): remove after upstream release\ncallLegacy({ timeout: 10 });",
    },
  });
  assert.equal(decision.allow, true);
});

test("artifact gate rejects removal of compiler-significant comments", () => {
  const decision = inspectArtifact({
    tool_name: "Edit",
    tool_input: {
      file_path: "/repo/api.go",
      old_string: "// +kubebuilder:validation:Minimum=1\ntype Count int",
      new_string: "type Count int64",
    },
  });
  assert.equal(decision.allow, false);
  assert.match(decision.reason, /protected|directive/i);
});

test("handleHook reads existing content before a full-file overwrite", async () => {
  const blocked = await handleHook(
    {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: {
        file_path: "/repo/api.go",
        content: "package api\n\ntype Count int64\n",
      },
    },
    {},
    { readFile: () => "package api\n\n// +kubebuilder:validation:Minimum=1\ntype Count int\n" },
  );
  assert.equal(blocked.hookSpecificOutput.permissionDecision, "deny");
});

test("protected extraction and verification catch lost operational content", () => {
  const original = [
    "Warning: migration deletes 42 records.",
    "Run `npm test` in /repo/app.",
    "See https://example.com/runbook.",
    "```sh",
    "deploy --dry-run",
    "```",
  ].join("\n");
  const anchors = extractProtected(original);
  assert.ok(anchors.some(({ value }) => value === "`npm test`"));
  assert.ok(anchors.some(({ value }) => value.includes("deploy --dry-run")));
  assert.equal(verifyPreservation(original, original, anchors).ok, true);
  assert.equal(verifyPreservation(original, "Migration ready.", anchors).ok, false);
});

test("local compression removes ritual prose but preserves code and warnings", () => {
  const original = [
    "Certainly!",
    "I'll walk you through what I did.",
    "",
    "## Result",
    "Fixed the parser.",
    "",
    "Fixed the parser.",
    "",
    "Warning: malformed input is still rejected.",
    "",
    "```js",
    "// Increment the counter by one",
    "count += 1;",
    "```",
    "",
    "Let me know if you need anything else.",
  ].join("\n");
  const result = compress(original, deriveContract("Fix the parser"));
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.text, /Certainly|walk you through|Let me know/);
  assert.equal(result.text.match(/Fixed the parser\./g)?.length, 1);
  assert.match(result.text, /Warning: malformed input/);
  assert.match(result.text, /\/\/ Increment the counter by one/);
});

test("local display preserves streaming boundaries and may hide filler-only batches", async () => {
  const filler = await handleHook({ hook_event_name: "MessageDisplay", delta: "Certainly!\n", final: false });
  assert.equal(filler.hookSpecificOutput.displayContent, "");

  const first = await handleHook({ hook_event_name: "MessageDisplay", delta: "Result:\n", final: false });
  const final = await handleHook({ hook_event_name: "MessageDisplay", delta: "Done.\n", final: true });
  assert.equal(first.hookSpecificOutput.displayContent, "Result:\n");
  assert.equal(final.hookSpecificOutput.displayContent, "Done.\n");
});

test("strict local display buffers and selects only the contracted units", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudiator-strict-"));
  const { createFileStore } = await import("../src/claudiator.mjs");
  const store = createFileStore(dataDir);

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "action", prompt: "State only the immediate security action" }, {}, { store });
  const hidden = await handleHook({ hook_event_name: "MessageDisplay", session_id: "action", message_id: "m", index: 0, final: false, delta: "Revoke the key now; " }, {}, { store });
  const action = await handleHook({ hook_event_name: "MessageDisplay", session_id: "action", message_id: "m", index: 1, final: true, delta: "then audit every log and ask for more context." }, {}, { store });
  assert.equal(hidden.hookSpecificOutput.displayContent, "");
  assert.equal(action.hookSpecificOutput.displayContent, "Revoke the key now.");

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "unclear", prompt: "State only the immediate security action" }, {}, { store });
  const unclearText = "This is serious. Revoke the key now.";
  const unclear = await handleHook({ hook_event_name: "MessageDisplay", session_id: "unclear", message_id: "m", index: 0, final: true, delta: unclearText }, {}, { store });
  assert.equal(unclear.hookSpecificOutput.displayContent, unclearText);

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "definition", prompt: "Define idempotency in one sentence." }, {}, { store });
  const definition = await handleHook({ hook_event_name: "MessageDisplay", session_id: "definition", message_id: "m", index: 0, final: true, delta: "Idempotency means repeated identical requests have the same effect as one request, making retries safe without duplicate side effects." }, {}, { store });
  assert.equal(definition.hookSpecificOutput.displayContent, "Idempotency means repeated identical requests have the same effect as one request.");

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "warning", prompt: "Give the command and the necessary warning. Add nothing else." }, {}, { store });
  const warning = await handleHook({ hook_event_name: "MessageDisplay", session_id: "warning", message_id: "m", index: 0, final: true, delta: "```sh\nrm -rf ./cache\n```\n\nThis irreversibly deletes the cache. Back it up first." }, {}, { store });
  assert.equal(warning.hookSpecificOutput.displayContent, "rm -rf ./cache\nThis irreversibly deletes the cache.");

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "answer", prompt: "A batch processed 148 records and rejected 23. How many were accepted?" }, {}, { store });
  const answer = await handleHook({ hook_event_name: "MessageDisplay", session_id: "answer", message_id: "m", index: 0, final: true, delta: "125 records were accepted (148 - 23 = 125)." }, {}, { store });
  assert.equal(answer.hookSpecificOutput.displayContent, "125 records were accepted.");

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "noop", prompt: "Please make sure telemetry is disabled in settings.json." }, {}, { store });
  const noop = await handleHook({ hook_event_name: "MessageDisplay", session_id: "noop", message_id: "m", index: 0, final: true, delta: "Telemetry is already disabled in settings.json (`telemetry: false`). No changes needed." }, {}, { store });
  assert.equal(noop.hookSpecificOutput.displayContent, "No changes needed.");

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "status", prompt: "Draft an internal status update for engineering and support." }, {}, { store });
  const status = await handleHook({ hook_event_name: "MessageDisplay", session_id: "status", message_id: "m", index: 0, final: true, delta: "**Status:** Ongoing\n\n**Impact:** All requests fail\n\n**Next update:** 09:10 UTC" }, {}, { store });
  assert.equal(status.hookSpecificOutput.displayContent, "**Status:** Ongoing **Impact:** All requests fail **Next update:** 09:10 UTC");

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "cleanup", prompt: "Delete regular files older than 7 days under /var/log/app without crossing filesystem boundaries." }, {}, { store });
  const cleanup = await handleHook({ hook_event_name: "MessageDisplay", session_id: "cleanup", message_id: "m", index: 0, final: true, delta: "```sh\nfind /var/log/app -xdev -type f -mtime +7 -delete\n```\n\nThis deletion is irreversible. The flags keep the operation on one filesystem and select old regular files." }, {}, { store });
  assert.equal(cleanup.hookSpecificOutput.displayContent, "find /var/log/app -xdev -type f -mtime +7 -delete\nThis deletion is irreversible.");

  const unsafeCleanupText = "```sh\nfind /var/log/app -type f -mtime +7 -delete\n```\n\nThis deletion is irreversible.";
  const unsafeCleanup = await handleHook({ hook_event_name: "MessageDisplay", session_id: "cleanup", message_id: "unsafe", index: 0, final: true, delta: unsafeCleanupText }, {}, { store });
  assert.equal(unsafeCleanup.hookSpecificOutput.displayContent, unsafeCleanupText);

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "tmp-cleanup", prompt: "Delete .tmp files older than 10 days under /var/cache/comet without crossing filesystem boundaries." }, {}, { store });
  const wrongScopeText = "```sh\nfind /var/cache/comet -xdev -type f -mtime +7 -delete\n```\n\nThis deletion is irreversible.";
  const wrongScope = await handleHook({ hook_event_name: "MessageDisplay", session_id: "tmp-cleanup", message_id: "wrong-scope", index: 0, final: true, delta: wrongScopeText }, {}, { store });
  assert.equal(wrongScope.hookSpecificOutput.displayContent, wrongScopeText);

  await handleHook({ hook_event_name: "UserPromptSubmit", session_id: "implementation", prompt: "Add a small utility in initials.js." }, {}, { store });
  const implementation = await handleHook({ hook_event_name: "MessageDisplay", session_id: "implementation", message_id: "m", index: 0, final: true, delta: "Created `initials.js` with `initials(name)`. It trims input, splits words, and uppercases their first letters." }, {}, { store });
  assert.equal(implementation.hookSpecificOutput.displayContent, "Created `initials.js` with `initials(name)`.");

  const anchoredImplementationText = "Created `initials.js`. Validation still requires `npm test`.";
  const anchoredImplementation = await handleHook({ hook_event_name: "MessageDisplay", session_id: "implementation", message_id: "anchored", index: 0, final: true, delta: anchoredImplementationText }, {}, { store });
  assert.equal(anchoredImplementation.hookSpecificOutput.displayContent, anchoredImplementationText);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("handleHook emits Claude Code context and gate schemas", async () => {
  const prompt = await handleHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Fix the parser",
  });
  assert.equal(prompt.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(prompt.hookSpecificOutput.additionalContext, /minimum sufficient/i);
  assert.match(prompt.hookSpecificOutput.additionalContext, /preserve conditions and qualifiers/i);

  const subagent = await handleHook({
    hook_event_name: "SubagentStart",
    agent_type: "Explore",
  });
  assert.equal(subagent.hookSpecificOutput.hookEventName, "SubagentStart");
  assert.match(subagent.hookSpecificOutput.additionalContext, /findings/i);

  const blocked = await handleHook({
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: {
      file_path: "/repo/a.js",
      content: "// This function returns true\nconst yes = () => true;",
    },
  });
  assert.equal(blocked.hookSpecificOutput.permissionDecision, "deny");

  const subagentStop = await handleHook({
    hook_event_name: "SubagentStop",
    stop_hook_active: false,
    last_assistant_message: "Certainly!\n\nDone.\n\nDone.\n\nLet me know if you need anything else.",
  });
  assert.equal(subagentStop.decision, "block");

  const repairedStop = await handleHook({
    hook_event_name: "SubagentStop",
    stop_hook_active: true,
    last_assistant_message: "Done.",
  });
  assert.deepEqual(repairedStop, {});
});

test("semantic display uses verified output and falls back to the original", async () => {
  const input = {
    hook_event_name: "MessageDisplay",
    session_id: "session",
    message_id: "message",
    index: 0,
    final: true,
    delta: "Certainly!\nWarning: port 8080 is public.\nThe server is ready.",
  };

  const accepted = await handleHook(
    input,
    { semanticRenderer: true, apiKey: "test" },
    {
      semanticCompress: async () => "Warning: port 8080 is public.\nServer ready.",
    },
  );
  assert.equal(
    accepted.hookSpecificOutput.displayContent,
    "Warning: port 8080 is public.\nServer ready.",
  );

  const rejected = await handleHook(
    input,
    { semanticRenderer: true, apiKey: "test" },
    { semanticCompress: async () => "Server ready." },
  );
  assert.equal(rejected.hookSpecificOutput.displayContent, input.delta);
});

test("Anthropic renderer sends protected anchors and accepts strict JSON", async () => {
  let request;
  const result = await anthropicSemanticCompress(
    "Certainly! Run `npm test` before deploying.",
    { apiKey: "secret", semanticModel: "claude-test" },
    async (url, init) => {
      request = { url, init };
      return {
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ text: "Run `npm test` before deploying." }) }],
        }),
      };
    },
  );
  assert.equal(result, "Run `npm test` before deploying.");
  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  assert.equal(request.init.headers["x-api-key"], "secret");
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, "claude-test");
  assert.match(body.messages[0].content, /`npm test`/);
});

test("streaming semantic display buffers until final without a daemon", async () => {
  const chunks = new Map();
  const store = {
    append(key, index, text) {
      const value = chunks.get(key) ?? new Map();
      value.set(index, text);
      chunks.set(key, value);
    },
    consume(key) {
      const value = [...(chunks.get(key) ?? new Map()).entries()]
        .sort(([a], [b]) => a - b)
        .map(([, text]) => text)
        .join("");
      chunks.delete(key);
      return value;
    },
    cleanupSession() {},
  };
  const dependencies = {
    store,
    semanticCompress: async (text) => text.replace("Certainly!\n", ""),
  };
  const base = {
    hook_event_name: "MessageDisplay",
    session_id: "s",
    message_id: "m",
  };
  const first = await handleHook(
    { ...base, index: 0, final: false, delta: "Certainly!\n" },
    { semanticRenderer: true, apiKey: "test" },
    dependencies,
  );
  assert.equal(first.hookSpecificOutput.displayContent, "");

  const final = await handleHook(
    { ...base, index: 1, final: true, delta: "Done." },
    { semanticRenderer: true, apiKey: "test" },
    dependencies,
  );
  assert.equal(final.hookSpecificOutput.displayContent, "Done.");
});

test("unwritable plugin data fails open without hiding streamed text", async () => {
  const failingStore = {
    append() { throw new Error("read only"); },
    consume() { throw new Error("read only"); },
    cleanupSession() { throw new Error("read only"); },
  };
  const displayed = await handleHook(
    {
      hook_event_name: "MessageDisplay",
      session_id: "s",
      message_id: "m",
      index: 0,
      final: false,
      delta: "Original text",
    },
    { semanticRenderer: true, apiKey: "test" },
    { store: failingStore },
  );
  assert.equal(displayed.hookSpecificOutput.displayContent, "Original text");
  await assert.doesNotReject(() => handleHook(
    { hook_event_name: "SessionEnd", session_id: "s" },
    {},
    { store: failingStore },
  ));
});

test("plugin metadata exposes a forced output style and every production hook", () => {
  const manifest = JSON.parse(fs.readFileSync(".claude-plugin/plugin.json", "utf8"));
  const marketplace = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
  const hooks = JSON.parse(fs.readFileSync("hooks/hooks.json", "utf8"));
  const style = fs.readFileSync("output-styles/claudiator.md", "utf8");

  assert.equal(manifest.name, "claudiator");
  assert.equal(marketplace.plugins[0].source, "./");
  assert.match(style, /force-for-plugin:\s*true/);
  for (const event of ["UserPromptSubmit", "SubagentStart", "SubagentStop", "PreToolUse", "MessageDisplay", "SessionEnd"]) {
    assert.ok(hooks.hooks[event], `${event} hook is registered`);
  }
  const handlers = Object.values(hooks.hooks).flatMap((groups) => groups.flatMap(({ hooks: eventHooks }) => eventHooks));
  assert.ok(handlers.every(({ type }) => type === "command"), "production hooks must not invoke another model");
  assert.ok(handlers.every(({ model }) => model === undefined), "production hooks must not require model access");
});

test("hook runner reads one event from stdin and writes only Claude hook JSON", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudiator-test-"));
  const child = spawnSync("node", ["scripts/claudiator.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      prompt: "Fix the typo",
    }),
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir },
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.equal(child.stderr, "");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("hook runner records content-free metrics", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudiator-metrics-"));
  const secret = "DO_NOT_LOG_THIS_CONTENT";
  const child = spawnSync("node", ["scripts/claudiator.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: JSON.stringify({
      hook_event_name: "MessageDisplay",
      delta: `Certainly!\n${secret}`,
      final: true,
    }),
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir },
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).hookSpecificOutput.displayContent, secret);
  const metrics = fs.readFileSync(path.join(dataDir, "metrics.jsonl"), "utf8");
  assert.doesNotMatch(metrics, new RegExp(secret));
  assert.match(metrics, /"event":"MessageDisplay"/);
  assert.match(metrics, /"inputChars":/);
  assert.match(metrics, /"displayChars":/);
  assert.match(metrics, /"shape":"default"/);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("hook runner captures content only under the explicit benchmark switch", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudiator-capture-"));
  const captureFile = path.join(dataDir, "capture.jsonl");
  const child = spawnSync("node", ["scripts/claudiator.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "MessageDisplay", delta: "Certainly!\nDone.", final: true, index: 0 }),
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir, CLAUDIATOR_BENCHMARK_CAPTURE_FILE: captureFile },
  });
  assert.equal(child.status, 0, child.stderr);
  const capture = JSON.parse(fs.readFileSync(captureFile, "utf8"));
  assert.equal(capture.raw, "Certainly!\nDone.");
  assert.equal(capture.displayed, "Done.");
  assert.equal(capture.contract.shape, "default");
  fs.rmSync(dataDir, { recursive: true, force: true });
});
