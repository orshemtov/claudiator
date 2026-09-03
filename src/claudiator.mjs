import fs from "node:fs";
import path from "node:path";

const DETAIL_RE = /\b(thorough|thoroughly|detailed|deep(?:ly)?|walkthrough|teach|explain why|step[- ]by[- ]step)\b/i;
const TABLE_RE = /\b(compare|comparison|versus|vs\.?|options|matrix|trade[- ]offs?)\b/i;
const DIAGRAM_RE = /\b(flow|architecture|hierarchy|diagram|pipeline|sequence)\b/i;
const LIST_RE = /\b(list|steps|several|checklist|requirements)\b/i;
const STRICT_FORMAT_RE = /\b(?:only|just|single|exactly|nothing else|compact(?:ly)?|concise(?:ly)?|brief(?:ly)?)\b/i;
const COMPACT_RE = /\b(?:compact(?:ly)?|concise(?:ly)?|brief(?:ly)?)\b/i;
const FILLER_LINE_RE = /^\s*(?:sure|certainly|absolutely|of course)[!.:,\s]*$/i;
const NARRATION_LINE_RE = /^\s*(?:i(?:'ll| will| am going to)|let me)\b/i;
const CLOSING_LINE_RE = /^\s*(?:let me know if|hope this helps|feel free to ask|if you(?:'d| would) like,? i can)\b.*[.!]?\s*$/i;
const WARNING_LINE_RE = /^\s*(?:warning|error|danger|caution|failed|failure|unknown|uncertain|unresolved)\s*:/i;
const UNCERTAINTY_RE = /\b(?:may|might|uncertain|unknown|unverified|not verified|probably|likely)\b/i;
const PROTECTED_COMMENT_RE = /(?:\+kubebuilder:|\bgo:(?:build|generate|embed)\b|^!|eslint-(?:disable|enable)|\bno(?:lint|qa)\b|@ts-(?:ignore|expect-error|nocheck|check)|shellcheck\b|istanbul ignore|c8 ignore|pragma\b|noinspection\b|generated (?:code|file)|code generated|sourceMappingURL|copyright|spdx-license|region\b|endregion\b|language=|noinspection)/i;
const TRACKING_RE = /\b(?:TODO|FIXME|HACK|XXX)\b/i;
const HISTORY_RE = /\b(?:used to|previously|historically|originally|changed from|we (?:chose|decided)|old implementation|implementation history)\b/i;
const NARRATIVE_RE = /^(?:this (?:function|method|class|code|block)|the following code|increment|decrement|set |get |return |loop |iterate |create |initialize |check |call |now we |here we )/i;
const COMMENTED_CODE_RE = /^(?:const|let|var|if|for|while|return|function|class|def|import|export|[\w.]+\s*=|[\w.]+\([^)]*\);?$)/;

export function deriveContract(prompt = "") {
  const depth = DETAIL_RE.test(prompt) ? "detailed" : "minimum";
  const strict = STRICT_FORMAT_RE.test(prompt);
  const wordLimit = COMPACT_RE.test(prompt) && /\bimmediate\b/i.test(prompt) ? 12 : undefined;
  let representation = "sentence";
  if (/\bmermaid\b/i.test(prompt)) representation = "mermaid";
  else if (TABLE_RE.test(prompt)) representation = "table";
  else if (DIAGRAM_RE.test(prompt)) representation = "ascii";
  else if (LIST_RE.test(prompt)) representation = "bullets";
  return { depth, representation, strict, wordLimit };
}

function commentText(line) {
  const trimmed = line.trim();
  if (/^(?:\/\/|#|--|;)/.test(trimmed)) return trimmed.replace(/^(?:\/\/\/!?|\/\/|#|--|;)\s?/, "");
  if (/^(?:\/\*+|\*|\*\/)/.test(trimmed)) return trimmed.replace(/^\/\*+\s?|^\*\/?\s?/, "").replace(/\*\/$/, "").trim();
  if (/^(?:'''|\"\"\")/.test(trimmed)) return trimmed.replace(/^(?:'''|\"\"\")|(?:'''|\"\"\")$/g, "").trim();
  return null;
}

export function classifyComments(content = "", language = "") {
  const result = [];
  let inBlock = false;
  let inDocstring = false;
  const lines = String(content).split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    const startsBlock = trimmed.startsWith("/*");
    const startsDocstring = /^(?:'''|\"\"\")/.test(trimmed);
    const isComment = inBlock || inDocstring || startsBlock || startsDocstring || /^(?:\/\/|#|--|;)/.test(trimmed);
    if (!isComment) continue;

    const text = commentText(raw) ?? trimmed.replace(/^\*\s?/, "");
    let kind = "meaningful";
    if (PROTECTED_COMMENT_RE.test(text) || (language === "go" && /^go:/.test(text))) kind = "protected";
    else if (TRACKING_RE.test(text)) kind = "tracking";
    else if (HISTORY_RE.test(text)) kind = "history";
    else if (COMMENTED_CODE_RE.test(text)) kind = "commented-code";
    else if (NARRATIVE_RE.test(text)) kind = "narrative";
    else if (startsDocstring || inDocstring || /^\*\*/.test(trimmed)) kind = "contract";

    if (text || kind === "protected") result.push({ line: index + 1, text, kind });
    if (startsBlock && !trimmed.includes("*/", 2)) inBlock = true;
    if (inBlock && trimmed.includes("*/")) inBlock = false;
    if (startsDocstring && (trimmed.match(/'''|\"\"\"/g)?.length ?? 0) < 2) inDocstring = !inDocstring;
    else if (inDocstring && /(?:'''|\"\"\")\s*$/.test(trimmed)) inDocstring = false;
  }
  return result;
}

function languageFor(filePath = "") {
  return path.extname(filePath).slice(1).toLowerCase();
}

function contentFromTool(input) {
  const tool = input.tool_input ?? {};
  if (input.tool_name === "Edit") return { content: tool.new_string ?? "", previous: tool.old_string ?? "" };
  if (input.tool_name === "NotebookEdit") return { content: tool.new_source ?? tool.source ?? "", previous: tool.old_source ?? "" };
  const direct = tool.content ?? tool.text ?? tool.body ?? tool.new_string ?? tool.new_source;
  return { content: typeof direct === "string" ? direct : "", previous: tool._existing_content ?? "" };
}

export function inspectArtifact(input = {}) {
  const isWriter = /^(?:Write|Edit|NotebookEdit)$/.test(input.tool_name ?? "") || /^mcp__.*__(?:write|create|update)/i.test(input.tool_name ?? "");
  if (!isWriter) return { allow: true };
  const { content, previous } = contentFromTool(input);
  if (!content) return { allow: true };
  const language = languageFor(input.tool_input?.file_path ?? input.tool_input?.path ?? "");
  const classifiedPrevious = classifyComments(previous, language);
  const previousComments = new Set(classifiedPrevious.map(({ text }) => text));
  const comments = classifyComments(content, language);
  const currentComments = new Set(comments.map(({ text }) => text));
  const removedProtected = classifiedPrevious.filter(({ kind, text }) => kind === "protected" && !currentComments.has(text));
  if (removedProtected.length) {
    return {
      allow: false,
      reason: "Preserve compiler, tooling, code-generation, lint, and other protected directives.",
      findings: removedProtected,
    };
  }
  const bad = comments.filter(({ kind, text }) => {
    if (previousComments.has(text)) return false;
    if (["narrative", "history", "commented-code"].includes(kind)) return true;
    return kind === "tracking" && !/(?:[A-Z][A-Z0-9]+-\d+|#\d+|https?:\/\/)/.test(text);
  });
  if (bad.length) {
    const kinds = [...new Set(bad.map(({ kind }) => kind))].join(", ");
    return {
      allow: false,
      reason: `Remove unnecessary ${kinds} comments. Keep compiler/tool directives and only comments that express a current non-obvious constraint.`,
      findings: bad,
    };
  }

  if (/\.(?:md|mdx|txt|rst)$/i.test(input.tool_input?.file_path ?? "")) {
    const reduced = compress(content, { depth: "minimum", representation: "sentence" });
    if (reduced.changed && reduced.removedLines >= 2) {
      return { allow: false, reason: "Remove the preamble, narration, repetition, and closing filler from this document." };
    }
  }
  return { allow: true };
}

function addAnchor(target, type, value) {
  const clean = value.trim();
  if (clean && !target.some((item) => item.value === clean)) target.push({ type, value: clean });
}

export function extractProtected(text = "") {
  const anchors = [];
  const source = String(text);
  for (const match of source.matchAll(/```[\s\S]*?```/g)) addAnchor(anchors, "code", match[0]);
  for (const match of source.matchAll(/`[^`\n]+`/g)) addAnchor(anchors, "inline-code", match[0]);
  for (const match of source.matchAll(/https?:\/\/[^\s)>\]]+/g)) addAnchor(anchors, "url", match[0].replace(/[.,;:]$/, ""));
  for (const line of source.split(/\r?\n/)) {
    if (WARNING_LINE_RE.test(line)) addAnchor(anchors, "warning", line);
    else if (UNCERTAINTY_RE.test(line)) addAnchor(anchors, "uncertainty", line);
  }
  for (const match of source.matchAll(/(?:^|[\s(])((?:\.{0,2}\/|\/)[\w.@%+~/-]+(?:\.[\w-]+)?|[A-Za-z]:\\[^\s]+)/gm)) addAnchor(anchors, "path", match[1]);
  for (const match of source.matchAll(/\b\d+(?:\.\d+)?(?:%|ms|s|m|h|KB|MB|GB)?\b/g)) addAnchor(anchors, "number", match[0]);
  return anchors;
}

export function verifyPreservation(_original, candidate, anchors = []) {
  const missing = anchors.filter(({ value }) => !String(candidate).includes(value));
  return { ok: missing.length === 0, missing };
}

function stripRitualLines(text) {
  const output = [];
  let inFence = false;
  let removedLines = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }
    if (!inFence && (FILLER_LINE_RE.test(line) || NARRATION_LINE_RE.test(line) || CLOSING_LINE_RE.test(line))) {
      removedLines += 1;
      continue;
    }
    output.push(line);
  }
  return { text: output.join("\n"), removedLines };
}

function dedupeParagraphs(text) {
  const seen = new Set();
  let removed = 0;
  const paragraphs = String(text).split(/\n\s*\n/).filter((part) => part.trim());
  const kept = paragraphs.filter((part) => {
    const key = part.trim().replace(/\s+/g, " ");
    if (/^```/.test(key) || !seen.has(key)) {
      seen.add(key);
      return true;
    }
    removed += part.split(/\r?\n/).length;
    return false;
  });
  return { text: kept.join("\n\n"), removedLines: removed };
}

function dedupeLines(text) {
  const seen = new Set();
  const output = [];
  let inFence = false;
  let removedLines = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const key = line.trim().replace(/\s+/g, " ");
    const eligible = !inFence && key.length > 10 && !/^(?:#|[-*+] |\d+\. |Warning:|Error:|Danger:|Caution:)/i.test(key);
    if (eligible && seen.has(key)) {
      removedLines += 1;
      continue;
    }
    if (eligible) seen.add(key);
    output.push(line);
  }
  return { text: output.join("\n"), removedLines };
}

export function compress(text = "", _contract = {}) {
  const original = String(text);
  const stripped = stripRitualLines(original);
  const lines = dedupeLines(stripped.text);
  const deduped = dedupeParagraphs(lines.text);
  const core = deduped.text.trim();
  const removedLines = stripped.removedLines + lines.removedLines + deduped.removedLines;
  if (!core) {
    const anchors = extractProtected(original);
    if (original.trim() && removedLines > 0 && anchors.length === 0) {
      return { text: "", changed: true, removedLines, fallback: false };
    }
    return { text: original, changed: false, removedLines: 0, fallback: true };
  }
  const leading = original.match(/^\s*\n/)?.[0] ?? "";
  const trailing = original.match(/\n+$/)?.[0] ?? "";
  const candidate = `${leading}${core}${trailing}`;
  const verification = verifyPreservation(original, candidate, extractProtected(original));
  if (!verification.ok) return { text: original, changed: false, removedLines: 0, fallback: true };
  return {
    text: candidate,
    changed: candidate !== original,
    removedLines,
    fallback: false,
  };
}

function contextFor(contract) {
  const depth = contract.depth === "detailed"
    ? "The user explicitly requested depth; provide it, but keep it structured and non-repetitive."
    : "Return the minimum sufficient answer: outcome, necessary evidence, actions, and unresolved risk only.";
  const constraint = contract.strict
    ? " The requested quantity or format is strict: return exactly that, with no qualification, alternative, or adjacent advice."
    : "";
  const limit = contract.wordLimit ? ` Hard limit: ${contract.wordLimit} words.` : "";
  return `${depth}${constraint}${limit}\nPreferred representation: ${contract.representation}. Follow the active Claudiator style.`;
}

function output(event, fields) {
  return { hookSpecificOutput: { hookEventName: event, ...fields } };
}

function envOptions(env = process.env) {
  return {
    semanticRenderer: /^(?:1|true|yes|on)$/i.test(env.CLAUDE_PLUGIN_OPTION_SEMANTIC_RENDERER ?? ""),
    apiKey: env.CLAUDE_PLUGIN_OPTION_API_KEY ?? "",
    semanticModel: env.CLAUDE_PLUGIN_OPTION_SEMANTIC_MODEL || "claude-haiku-4-5-20251001",
  };
}

export function createFileStore(dataDir) {
  const root = path.join(dataDir, "buffers");
  const safe = (value) => String(value ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  const dirFor = (key) => path.join(root, safe(key));
  return {
    append(key, index, text) {
      const dir = dirFor(key);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${Number(index)}.txt`), String(text));
    },
    consume(key) {
      const dir = dirFor(key);
      if (!fs.existsSync(dir)) return "";
      const text = fs.readdirSync(dir)
        .filter((name) => /^\d+\.txt$/.test(name))
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
        .map((name) => fs.readFileSync(path.join(dir, name), "utf8"))
        .join("");
      fs.rmSync(dir, { recursive: true, force: true });
      return text;
    },
    cleanupSession(sessionId) {
      if (!fs.existsSync(root)) return;
      const prefix = `${safe(sessionId)}_`;
      for (const name of fs.readdirSync(root)) {
        if (name.startsWith(prefix)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
      }
    },
  };
}

export async function anthropicSemanticCompress(text, options, fetchImpl = fetch) {
  const anchors = extractProtected(text).map(({ value }) => value);
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: options.semanticModel,
      max_tokens: 4096,
      temperature: 0,
      system: "Delete unnecessary prose while preserving every required fact and protected string. Return only JSON: {\"text\":\"...\"}.",
      messages: [{
        role: "user",
        content: `Protected strings must appear verbatim:\n${JSON.stringify(anchors)}\n\nCompress this assistant message:\n${text}`,
      }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Anthropic API returned ${response.status}`);
  const body = await response.json();
  if (body.stop_reason === "max_tokens") throw new Error("Semantic response was truncated");
  const raw = body.content?.find(({ type }) => type === "text")?.text;
  if (!raw) throw new Error("Semantic response contained no text");
  const parsed = JSON.parse(raw);
  if (typeof parsed.text !== "string" || !parsed.text.trim()) throw new Error("Semantic response was malformed");
  return parsed.text.trim();
}

export async function handleHook(input = {}, options = envOptions(), dependencies = {}) {
  const event = input.hook_event_name;
  if (event === "UserPromptSubmit") {
    return output(event, { additionalContext: contextFor(deriveContract(input.prompt)) });
  }
  if (event === "SubagentStart") {
    return output(event, {
      additionalContext: "Return only findings, exact evidence, changes made, and unresolved risks. Use bullets or a compact table. No preamble, narration, history, or recap.",
    });
  }
  if (event === "PreToolUse") {
    let inspected = input;
    if (input.tool_name === "Write" && input.tool_input?.file_path && dependencies.readFile) {
      try {
        inspected = {
          ...input,
          tool_input: {
            ...input.tool_input,
            _existing_content: dependencies.readFile(input.tool_input.file_path),
          },
        };
      } catch {}
    }
    const decision = inspectArtifact(inspected);
    if (decision.allow) return {};
    return output(event, {
      permissionDecision: "deny",
      permissionDecisionReason: decision.reason,
    });
  }
  if (event === "MessageDisplay") {
    const semantic = Boolean(options.semanticRenderer && options.apiKey);
    if (!semantic) {
      const result = compress(input.delta, deriveContract(""));
      return output(event, { displayContent: result.text });
    }
    const key = `${input.session_id}_${input.message_id}`;
    const store = dependencies.store;
    try {
      if (store) store.append(key, input.index, input.delta);
      else if (!input.final) return output(event, { displayContent: input.delta });
    } catch {
      return output(event, { displayContent: input.delta });
    }
    if (!input.final) return output(event, { displayContent: "" });
    let original = input.delta;
    try {
      if (store) original = store.consume(key);
    } catch {
      return output(event, { displayContent: input.delta });
    }
    try {
      const semanticCompress = dependencies.semanticCompress ?? anthropicSemanticCompress;
      const candidate = await semanticCompress(original, options);
      const verified = verifyPreservation(original, candidate, extractProtected(original));
      return output(event, { displayContent: verified.ok ? candidate : original });
    } catch {
      return output(event, { displayContent: original });
    }
  }
  if (event === "SessionEnd") {
    try {
      dependencies.store?.cleanupSession(input.session_id);
    } catch {}
    return {};
  }
  return {};
}

export { envOptions };
