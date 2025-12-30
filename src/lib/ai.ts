import {
  GenerateContentResponse,
  GoogleGenAI,
} from "@google/genai";
import { ReadingMemory, tryCall } from "./utils";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export async function callAI(
  model: string,
  config: any,
  conversation: ReadingMemory
): Promise<GenerateContentResponse | undefined> {
  const result = await tryCall<GenerateContentResponse>(async () => {
    const messages = conversation.toMessages();
    
    // Ensure the last message is from user role for Google Generative AI API
    // If the last message is from "model", remove it as it will be added by the API response
    const messagesToSend = messages.length > 0 && messages[messages.length - 1].role === "model"
      ? messages.slice(0, -1)
      : messages;
    
    const result = await ai.models.generateContent({
      model,
      config,
      contents: messagesToSend,
    });
    return result;
  });

  return result;
}

export function handleConversation(
  result: GenerateContentResponse | undefined,
  conversation: ReadingMemory
) {
  if (result === undefined) return [];

  const responseObject = JSON.parse(result.text as string);
  if (responseObject.length === 0) return [];

  // Add assistant message
  conversation.push({
    role: "model",
    parts: [
      {
        text: result.text,
      },
    ],
  });

  return responseObject;
}