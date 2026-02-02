import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEntityManager } from "../../../memory/entity-manager.js";
import { makeTempWorkspace } from "../../../test-helpers/workspace.js";
import { createHookEvent } from "../../hooks.js";
import handler from "./handler.js";

describe("memory-capture hook", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await makeTempWorkspace("openclaw-memory-capture-");
  });

  afterEach(async () => {});

  it("runs capture on agent:end with workspaceDir and messages", async () => {
    const event = createHookEvent("agent", "end", "agent:main:telegram", {
      workspaceDir,
      messages: [{ role: "user", content: "I prefer brief answers." }],
      success: true,
    });
    await handler(event);
    const entityManager = getEntityManager(workspaceDir);
    const user = await entityManager.getEntity("user");
    expect(user).not.toBeNull();
    expect(user!.facts.length).toBeGreaterThanOrEqual(1);
    expect(user!.facts.some((f) => f.type === "opinion")).toBe(true);
  });

  it("no-ops when workspaceDir is missing", async () => {
    const event = createHookEvent("agent", "end", "agent:main:telegram", {
      messages: [{ role: "user", content: "I prefer X." }],
    });
    await handler(event);
    // No throw; no workspace to check
  });

  it("no-ops when messages is empty", async () => {
    const event = createHookEvent("agent", "end", "agent:main:telegram", {
      workspaceDir,
      messages: [],
    });
    await handler(event);
    const entityManager = getEntityManager(workspaceDir);
    const user = await entityManager.getEntity("user");
    expect(user).toBeNull();
  });
});
