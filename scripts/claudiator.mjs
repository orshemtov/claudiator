import fs from "node:fs";
import path from "node:path";
import {
  createFileStore,
  envOptions,
  handleHook,
} from "../src/claudiator.mjs";

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function record(dataDir, event, input, result, durationMs) {
  if (!dataDir) return;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, "metrics.jsonl");
    if (fs.existsSync(file) && fs.statSync(file).size > 5_000_000) {
      fs.rmSync(`${file}.1`, { force: true });
      fs.renameSync(file, `${file}.1`);
    }
    const displayed = result?.hookSpecificOutput?.displayContent;
    fs.appendFileSync(file, `${JSON.stringify({
      at: new Date().toISOString(),
      event,
      inputChars: typeof input.delta === "string" ? input.delta.length : undefined,
      displayChars: typeof displayed === "string" ? displayed.length : undefined,
      durationMs,
    })}\n`);
  } catch {
    return;
  }
}

function captureBenchmark(file, input, result) {
  if (!file || input.hook_event_name !== "MessageDisplay") return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({
    messageId: input.message_id,
    index: input.index,
    final: input.final,
    raw: input.delta,
    displayed: result?.hookSpecificOutput?.displayContent,
  })}\n`);
}

try {
  const started = performance.now();
  const input = JSON.parse(await readStdin());
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  const store = dataDir ? createFileStore(dataDir) : undefined;
  const result = await handleHook(input, envOptions(), {
    store,
    readFile: (file) => fs.readFileSync(file, "utf8"),
  });
  record(dataDir, input.hook_event_name, input, result, Math.round(performance.now() - started));
  captureBenchmark(process.env.CLAUDIATOR_BENCHMARK_CAPTURE_FILE, input, result);
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(`Claudiator hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
