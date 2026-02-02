import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempWorkspace } from "../test-helpers/workspace.js";
import { captureFromAgentEnd } from "./capture-engine.js";
import { getEntityManager } from "./entity-manager.js";

describe("captureFromAgentEnd", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await makeTempWorkspace("openclaw-capture-");
  });

  afterEach(async () => {
    // Temp dir cleaned up by OS or test runner
  });

  it("returns zero captured for empty messages", async () => {
    const result = await captureFromAgentEnd(workspaceDir, { messages: [] });
    expect(result.captured).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("extracts and persists preference-like fact from user message", async () => {
    const messages = [
      { role: "user", content: "I prefer short replies on WhatsApp, under 1500 chars." },
    ];
    const result = await captureFromAgentEnd(workspaceDir, {
      messages,
      defaultEntity: "user",
      maxFactsPerRun: 5,
    });
    expect(result.captured).toBeGreaterThanOrEqual(1);
    const entityManager = getEntityManager(workspaceDir);
    const user = await entityManager.getEntity("user");
    expect(user).not.toBeNull();
    expect(user!.facts.some((f) => f.type === "opinion" && f.content.includes("short"))).toBe(true);
  });

  it("extracts experience-like fact from assistant message", async () => {
    const messages = [
      {
        role: "assistant",
        content: "We fixed the Baileys WS crash by wrapping handlers in try/catch.",
      },
    ];
    const result = await captureFromAgentEnd(workspaceDir, {
      messages,
      defaultEntity: "user",
      maxFactsPerRun: 5,
    });
    expect(result.captured).toBeGreaterThanOrEqual(1);
    const entityManager = getEntityManager(workspaceDir);
    const user = await entityManager.getEntity("user");
    expect(user).not.toBeNull();
    expect(user!.facts.some((f) => f.type === "experience")).toBe(true);
  });

  it("respects maxFactsPerRun", async () => {
    const messages = [
      {
        role: "user",
        content: "I prefer apples. I like oranges. I enjoy bananas. I love grapes. I prefer kiwis.",
      },
    ];
    const result = await captureFromAgentEnd(workspaceDir, {
      messages,
      defaultEntity: "user",
      maxFactsPerRun: 2,
    });
    expect(result.captured).toBeLessThanOrEqual(2);
  });

  it("uses @mention for entity when present", async () => {
    const messages = [{ role: "user", content: "I prefer concise answers. @Peter" }];
    await captureFromAgentEnd(workspaceDir, {
      messages,
      defaultEntity: "user",
      maxFactsPerRun: 5,
    });
    const entityManager = getEntityManager(workspaceDir);
    const peter = await entityManager.getEntity("peter");
    expect(peter).not.toBeNull();
    expect(peter!.facts.some((f) => f.type === "opinion")).toBe(true);
  });
});
