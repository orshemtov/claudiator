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

test("deriveContract selects terminal-friendly structure and honors requested depth", () => {
  assert.equal(deriveContract("Compare these three options").representation, "table");
  assert.equal(deriveContract("Show the request flow in Claude Code").representation, "ascii");
  assert.equal(deriveContract("Explain this thoroughly").depth, "detailed");
  assert.equal(deriveContract("Fix the typo").depth, "minimum");
  assert.equal(deriveContract("Give only the single command").strict, true);
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

test("handleHook emits Claude Code context and gate schemas", async () => {
  const prompt = await handleHook({
    hook_event_name: "UserPromptSubmit",
    prompt: "Fix the parser",
  });
  assert.equal(prompt.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(prompt.hookSpecificOutput.additionalContext, /minimum sufficient/i);

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
  fs.rmSync(dataDir, { recursive: true, force: true });
});
