import { Hono } from "hono";
import type { Update } from "grammy/types";

import { handleTelegramUpdate } from "./bot";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "belita-skin-match-bot",
    runtime: "cloudflare-workers"
  });
});

app.post("/webhook", async (c) => {
  const secretHeader = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (!secretHeader || secretHeader !== c.env.WEBHOOK_SECRET) {
    return c.json({ ok: false, error: "forbidden" }, 403);
  }

  let update: Update;
  try {
    update = (await c.req.json()) as Update;
  } catch (error) {
    console.error("Failed to parse Telegram update", error);
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }

  try {
    await handleTelegramUpdate(c.env, update);
    return c.json({ ok: true });
  } catch (error) {
    console.error("Unhandled webhook error", error);
    return c.json({ ok: false, error: "webhook_failed" }, 500);
  }
});

export default app;
