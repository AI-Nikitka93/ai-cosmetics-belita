import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { QdrantClientAdapter } from "../../src/adapters/qdrant/qdrant-client";
import type { Env } from "../../src/env";
import type { ProductMatch } from "../../src/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devVarsPath = path.resolve(__dirname, "../../.dev.vars");

function loadEnvFromDevVars(): Env {
  const raw = readFileSync(devVarsPath, "utf8");
  const env = {} as Record<string, string>;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env as unknown as Env;
}

function parseArgs(argv: string[]): { query: string; limit: number } {
  let query = "";
  let limit = 6;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--query") {
      query = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (token === "--limit") {
      const parsed = Number.parseInt(argv[index + 1] ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed;
      }
      index += 1;
    }
  }

  return { query: query.trim(), limit };
}

function serializeProduct(product: ProductMatch): Record<string, unknown> {
  return {
    id: product.id,
    score: product.score,
    name: product.name,
    brand: product.brand,
    line: product.line,
    category: product.category,
    purpose: product.purpose,
    ingredients: product.ingredients,
    flags: product.flags,
    skinTypes: product.skinTypes,
    concerns: product.concerns,
    sourceUrl: product.sourceUrl
  };
}

async function main(): Promise<void> {
  const { query, limit } = parseArgs(process.argv.slice(2));

  if (!query) {
    console.log(
      JSON.stringify(
        {
          query,
          limit,
          error: "Missing query text.",
          products: []
        },
        null,
        2
      )
    );
    return;
  }

  const client = new QdrantClientAdapter(loadEnvFromDevVars());
  const products = await client.searchProducts({
    queryText: query,
    skinTypes: [],
    concerns: [],
    excludeFragrance: false,
    requireGentle: false,
    limit
  });

  console.log(
    JSON.stringify(
      {
        query,
        limit,
        products: products.map(serializeProduct)
      },
      null,
      2
    )
  );
}

await main();
