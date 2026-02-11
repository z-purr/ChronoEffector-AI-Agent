import { LLMClient, type ChatMessage } from "@blockrun/llm";
import { type Hex } from "viem";

export function createLLMClient(privateKey: Hex) {
  return new LLMClient({ privateKey });
}

export async function reason(
  client: LLMClient,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const result = await client.chatCompletion(model, messages);
  return result.choices[0].message.content ?? "";
}
