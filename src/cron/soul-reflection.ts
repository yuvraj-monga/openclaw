/**
 * Soul Reflection Cron Job
 * 
 * Scheduled job to run soul reflection periodically (weekly by default).
 */

import type { OpenClawConfig } from "../config/config.js";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveMemorySearchConfig } from "../agents/memory-search.js";
import { runSoulReflection } from "../agents/soul-reflection.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("cron:soul-reflection");

export interface SoulReflectionCronOptions {
  config: OpenClawConfig;
  agentId?: string;
}

/**
 * Run soul reflection cron job
 */
export async function runSoulReflectionCron(options: SoulReflectionCronOptions): Promise<void> {
  const { config } = options;
  const agentId = options.agentId ?? resolveDefaultAgentId(config);

  log.info(`Running soul reflection for agent: ${agentId}`);

  try {
    const memorySearchConfig = resolveMemorySearchConfig(config, agentId);
    await runSoulReflection({
      agentId,
      config,
      memorySearchConfig,
    });
    log.info("Soul reflection completed successfully");
  } catch (err) {
    log.error(`Soul reflection failed: ${String(err)}`);
    throw err;
  }
}
