import { CoreMessage, generateObject, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import '@ungap/with-resolvers';
import { PDFPageProxy } from 'pdfjs-dist/types/web/interfaces';
import { Line, Summary } from '@/lib/types';
import Mustache from 'mustache';

export function useScanner (canvasFactory: any): [() => Buffer[], (page: PDFPageProxy) => Promise<Buffer>] {
  
  const imagesCache: Buffer[] = [];

  return [() => imagesCache, async (page: PDFPageProxy) => {
  
    // Render the page on a Node canvas with 100% scale.
    const viewport = page.getViewport({ scale: 1 });
    const canvasAndContext = canvasFactory.create(
      viewport.width,
      viewport.height
    );
    const renderContext = {
      canvasContext: canvasAndContext.context,
      viewport,
    };
  
    const renderTask = page.render(renderContext);
    await renderTask.promise;
  
    const image = canvasAndContext.canvas.toBuffer("image/png");

    imagesCache.push(image);
  
    return image;

  }]

}

export function useSheeter(): [Line[], (key: number, image: Buffer) => Promise<Line[]>] {
  const MAX_TOKENS = 950000;
  const conversation: Array<CoreMessage> = [];
  const sheet: Line[] = [];

  async function extract(key: number, image: Buffer): Promise<Line[]> {
    const result = await generateObject({
      model: google('gemini-2.5-flash-preview-04-17'),
      system: await fs.readFile(path.join('src/lib/prompts', 'sheetify.md'), 'utf-8'),
      schema: z.array(z.object({
        ['الشخصية']: z.string(),
        ['النص']: z.string(),
        ['النبرة']: z.string(),
        ['المكان']: z.string(),
        ['الخلفية الصوتية']: z.string(),
      })),
      messages: [...conversation, {
        role: 'user',
        content: [{ type: 'text', text: `أنت الأن تقرأ الصفحة رقم ${key}` }, { type: 'image', image }],
      }],
    });

    const responseObject: Line[] = result.object.map((line, index) => ({ ...line, ['رقم الصفحة']: key, ['رقم النص']: index + 1 })) || [];

    // Save to sheet
    try {
      sheet.push(...responseObject);
    } catch (err) {
      console.error('Failed to parse assistant response:', responseObject, err);
    }

    // Add assistant message
    conversation.push({
      role: 'assistant',
      content: [{ type: 'text', text: responseObject.map(line => `${line['الشخصية']} : ${line['النص']}`).join('\n') }],
    });

    // Trim conversation if token count too high
    if (result.usage && result.usage.totalTokens > MAX_TOKENS) {
      trimConversation(conversation, MAX_TOKENS);
    }

    return responseObject;

  }

  return [sheet, extract] as const;
}


function trimConversation(conversation: Array<CoreMessage>, maxTokens: number) {
  let totalTokens = 0;
  const tokenCounts = [];

  // Estimate tokens for each message
  for (const message of conversation) {
    const messageText = (message.content as Array<{ type: string, text: string }>)
      .map(content => content.text || '')
      .join(' ');
    const tokenCount = estimateTokens(messageText);
    tokenCounts.push(tokenCount);
    totalTokens += tokenCount;
  }

  // Remove oldest message pairs until within token limit
  while (totalTokens > maxTokens && conversation.length > 2) {
    // Remove the first two messages (user and model pair)
    const removedUser = conversation.shift();
    const removedModel = conversation.shift();
    // @ts-ignore
    const removedTokens = tokenCounts.shift() + tokenCounts.shift();
    totalTokens -= removedTokens;
  }
}

// Simple token estimation function (adjust as needed)
function estimateTokens(text: string) {
  return Math.ceil(text.split(/\s+/).length * 1.5); // Approximate tokens per word
}
