import { CoreMessage, generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import '@ungap/with-resolvers';
import { PDFPageProxy } from 'pdfjs-dist/types/web/interfaces';
import { Line, Summary } from '@/lib/types';

export function useScanner (canvasFactory: any): [(key?: number) => Record<number, Buffer> | Buffer, (key: number, page: PDFPageProxy) => Promise<Buffer>] {
  
  const imagesCache: Record<number, Buffer> = {};

  return [(key?: number) => key == undefined ? imagesCache : imagesCache[key], async (key: number, page: PDFPageProxy) => {
  
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

    imagesCache[key] = image;
  
    return image;

  }]

}

export async function useSheeter(): Promise<[Line[], (key: number, image: Buffer) => Promise<Line[]>]> {
  const MAX_TOKENS = 950000;
  const conversation: Array<CoreMessage> = [];
  const sheet: Line[] = [];
  const instructions = await fs.readFile(path.join('src/lib/prompts', 'sheetify.md'), 'utf-8');

  async function extract(key: number, image: Buffer): Promise<Line[]> {

    conversation.push({
      role: 'user',
      content: [{ type: 'image', image }],
    })

    const result = await generateObject({
      model: google('gemini-2.5-flash-preview-04-17'),
      system: instructions,
      schema: z.array(z.object({
        ['الشخصية']: z.string(),
        ['النص']: z.string(),
        ['النبرة']: z.string(),
        ['المكان']: z.string(),
        ['الخلفية الصوتية']: z.string(),
      })),
      messages: conversation,
    });

    const responseObject: Omit<Line, 'رقم النص' | 'رقم الصفحة'>[] = result.object;
    const lines: Line[] = responseObject.map((line, index) => ({ ...line, ['رقم الصفحة']: key, ['رقم النص']: index + 1 }));

    if ( responseObject.length === 0 ) return [];

    try {
      sheet.push(...lines);
    } catch (err) {
      console.error('Failed to parse assistant response:', responseObject, err);
    }

    // Add assistant message
    conversation.push({
      role: 'assistant',
      content: [{ type: 'text', text: JSON.stringify(responseObject) }],
    });

    // Trim conversation if token count too high
    if (result.usage && result.usage.totalTokens > MAX_TOKENS) {
      trimConversation(conversation, MAX_TOKENS);
    }

    return lines;

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
