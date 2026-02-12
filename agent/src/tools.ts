import type { Action } from "@coinbase/agentkit";
import type { Tool } from "@blockrun/llm";
import { zodToJsonSchema } from "zod-to-json-schema";

// Map of action name -> invoke fn
const actionMap = new Map<string, Action["invoke"]>();

/**
 * Convert AgentKit actions into BlockRun tool definitions.
 * Also builds internal map for dispatching tool calls.
 */
export function actionsToTools(actions: Action[]): Tool[] {
  actionMap.clear();
  return actions.map((action) => {
    actionMap.set(action.name, action.invoke);
    return {
      type: "function" as const,
      function: {
        name: action.name,
        description: action.description,
        parameters: zodToJsonSchema(action.schema, { target: "openApi3" }) as Record<
          string,
          unknown
        >,
      },
    };
  });
}

/**
 * Execute a tool call by name with JSON args string.
 * Returns the string result from the AgentKit action.
 */
export async function executeTool(name: string, argsJson: string): Promise<string> {
  const handler = actionMap.get(name);
  if (!handler) {
    return `Error: unknown tool "${name}"`;
  }
  try {
    const args = JSON.parse(argsJson);
    return await handler(args);
  } catch (err) {
    return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
