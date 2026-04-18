import OpenAI from "openai";
import { ReadingMemory, tryCall } from "./utils";

let _ai: OpenAI | null = null;

export function getAI(): OpenAI {
  if (!_ai) {
    const apiKey = process.env.OPEN_ROUTE;
    if (!apiKey) {
      throw new Error("OPEN_ROUTE environment variable is not set");
    }
    _ai = new OpenAI({ 
      baseURL: "https://openrouter.ai/api/v1",
      apiKey 
    });
  }
  return _ai;
}

export async function callAI(
  model: string,
  config: any,
  conversation: ReadingMemory
) {
  const result = await tryCall(async () => {
    const messagesToSend = conversation.toMessages();
    
    return await getAI().chat.completions.create({
      model,
      messages: messagesToSend,
      ...config,
    });
  });

  return result;
}

export function handleConversation(
  result: any,
  conversation: ReadingMemory
) {
  if (!result || !result.choices || result.choices.length === 0) return [];

  const messageContent = result.choices[0].message.content;
  if (!messageContent) return [];

  let responseObject;
  try {
    responseObject = JSON.parse(messageContent);
  } catch (err) {
    console.error("Failed to parse AI response:", messageContent, err);
    return [];
  }

  // Add assistant message
  conversation.push({
    role: "assistant",
    content: messageContent,
  });

  // Since we require wrapped JSON objects (e.g. {"results": [...]}) for OpenAI compat,
  // we attempt to unwrap the results if they are in a known wrapper key like 'results'.
  // But actually the schema mapping will unpack it later or we can do it here.
  if (responseObject && !Array.isArray(responseObject) && Array.isArray(responseObject.results)) {
    return responseObject.results;
  }

  return responseObject;
}