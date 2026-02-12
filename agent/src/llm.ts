import { LLMClient, type ChatMessage, type Tool } from "@blockrun/llm";
import { type Hex } from "viem";
import { executeTool } from "./tools.js";

const MAX_TOOL_ROUNDS = 10;

export function createLLMClient(privateKey: Hex) {
  return new LLMClient({ privateKey });
}

/**
 * Agentic loop: calls LLM with tools, executes any tool calls,
 * feeds results back, repeats until the model stops or max rounds hit.
 * Returns the final text response.
 */
export async function runAgentLoop(
  client: LLMClient,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  tools: Tool[],
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await client.chatCompletion(model, messages, {
      tools: tools.length > 0 ? tools : undefined,
      toolChoice: tools.length > 0 ? "auto" : undefined,
    });

    const choice = result.choices[0];
    const msg = choice.message;

    // Append assistant message to history
    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: msg.tool_calls,
    });

    // If no tool calls, we're done
    if (choice.finish_reason !== "tool_calls" || !msg.tool_calls?.length) {
      return msg.content ?? "";
    }

    // Execute each tool call and append results
    for (const toolCall of msg.tool_calls) {
      const { name, arguments: argsJson } = toolCall.function;
      console.log(`[tool] calling ${name}(${argsJson})`);

      const toolResult = await executeTool(name, argsJson);
      console.log(`[tool] ${name} -> ${toolResult.slice(0, 200)}`);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  // Exhausted rounds - get final response without tools
  console.log("[llm] max tool rounds reached, getting final response");
  const final = await client.chatCompletion(model, messages);
  return final.choices[0].message.content ?? "";
}
