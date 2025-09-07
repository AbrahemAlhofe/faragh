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
    const result = await ai.models.generateContent({
      model,
      config,
      contents: conversation.toMessages(),
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