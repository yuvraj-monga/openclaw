/**
 * Memory capture hook handler
 *
 * Runs proactive memory capture when an agent run ends: extracts candidate facts
 * from the conversation and persists them to the entity/opinion bank.
 */

import type { HookHandler } from "../../hooks.js";
import { onAgentEnd } from "../../../memory/capture-hooks.js";

/**
 * Handle agent:end internal event: run post-task capture (extract and persist facts).
 */
const memoryCaptureHandler: HookHandler = async (event) => {
  await onAgentEnd(event);
};

export default memoryCaptureHandler;
