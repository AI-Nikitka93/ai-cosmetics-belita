import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const runnerPath = path.resolve(__dirname, "./qdrant-search-runner.ts");
const tsxCliPath = path.resolve(projectRoot, "node_modules/tsx/dist/cli.mjs");

function parseLimit(rawLimit, fallback) {
  if (typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit > 0) {
    return Math.trunc(rawLimit);
  }

  if (typeof rawLimit === "string") {
    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

export default class BelitaQdrantSearchProvider {
  id() {
    return "belita-qdrant-live";
  }

  async callApi(prompt, context) {
    const query = String(context?.vars?.query ?? prompt ?? "").trim();
    const limit = parseLimit(context?.vars?.limit, 6);

    const { stdout } = await execFileAsync(
      process.execPath,
      [tsxCliPath, runnerPath, "--query", query, "--limit", String(limit)],
      {
        cwd: projectRoot,
        maxBuffer: 4 * 1024 * 1024
      }
    );

    return {
      output: stdout.trim(),
      cost: 0,
      cached: false
    };
  }
}
