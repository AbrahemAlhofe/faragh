import fs from 'fs/promises';
import path from 'path';
import '@ungap/with-resolvers';
import { PDFPageProxy } from 'pdfjs-dist/types/web/interfaces';
import { LineRow } from '@/lib/types';
import { ReadingMemory, tryCall } from './utils';
import {GenerateContentResponse, GoogleGenAI, Type} from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY});

export function useScanner(
  canvasFactory: any,
  scale: number = 1
): [
  (key?: number) => Record<number, string> | string,
  (key: number, page: PDFPageProxy) => Promise<string>
] {
  const imagesCache: Record<number, string> = {};

  return [
    (key?: number) =>
      key === undefined ? imagesCache : imagesCache[key],

    async (key: number, page: PDFPageProxy) => {
      const viewport = page.getViewport({ scale });
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

      const imageBuffer = canvasAndContext.canvas.toBuffer("image/png");

      const file = await tryCall(async () => await ai.files.upload({ file: new Blob([imageBuffer]), config: { mimeType: "image/png" } }));
      
      if ( file === undefined) throw new Error('Failed to upload image to Google Cloud Storage');

      const uri = file.uri as string;
      imagesCache[key] = uri;

      return uri;
    },
  ];
}

export async function useSheeter({ readingMemoryLimit }: { readingMemoryLimit: number } = { readingMemoryLimit: 10 }): Promise<[LineRow[], (key: number, image: string) => Promise<LineRow[]>]> {
  const conversation: ReadingMemory = new ReadingMemory(readingMemoryLimit ?? 10);
  const sheet: LineRow[] = [];
  const instructions = await fs.readFile(path.join('src/lib/prompts', 'sheetify.md'), 'utf-8');

  async function extract(key: number, image: string): Promise<LineRow[]> {

    conversation.push({
      role: 'user',
      parts: [
        {
          fileData: {
            fileUri: image,
            mimeType: 'image/png',
          }
        }
      ],
    })

    const result = await tryCall<GenerateContentResponse>(async () => {

      console.log(`Start page ${key}`);
          
      const config = {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['الشخصية', 'النص', 'النبرة', 'المكان', 'الخلفية الصوتية'],
              properties: {
                ['الشخصية']: {
                  type: Type.STRING,
                },
                ['النص']: {
                  type: Type.STRING,
                },
                ['النبرة']: {
                  type: Type.STRING,
                },
                ['المكان']: {
                  type: Type.STRING,
                },
                ['الخلفية الصوتية']: {
                  type: Type.STRING,
                },
              },
            },
          },
          systemInstruction: [
              {
                text: instructions,
              }
          ],
        };

        const model = 'gemini-2.5-flash';

        const result = await ai.models.generateContent({
          model,
          config,
          contents: conversation.toMessages(),
        });

        return result;
    });

    if (result === undefined) return [];

    const responseObject: Omit<LineRow, 'رقم النص' | 'رقم الصفحة'>[] = JSON.parse(result.text as string);
    const lines: LineRow[] = responseObject.map((line, index) => ({ ...line, ['رقم الصفحة']: key, ['رقم النص']: index + 1 }));

    if ( responseObject.length === 0 ) return [];

    try {
      sheet.push(...lines);
    } catch (err) {
      console.error('Failed to parse assistant response:', responseObject, err);
    }

    // Add assistant message
    conversation.push({
      role: 'model',
      parts: [
        {
          text: result.text
        }
      ]
    });

    return lines;

  }

  return [sheet, extract] as const;
}

export async function useForeignNamesExtractor({ readingMemoryLimit }: { readingMemoryLimit: number } = { readingMemoryLimit: 10 }): Promise<[LineRow[], (key: number, image: string) => Promise<LineRow[]>]> {
  const conversation: ReadingMemory = new ReadingMemory(readingMemoryLimit ?? 10);
  const sheet: LineRow[] = [];
  const instructions = await fs.readFile(path.join('src/lib/prompts', 'foreign-name-extraction.md'), 'utf-8');

  async function extract(key: number, image: string): Promise<LineRow[]> {

    conversation.push({
      role: 'user',
      parts: [
        {
          fileData: {
            fileUri: image,
            mimeType: 'image/png',
          }
        }
      ],
    })

    const result = await tryCall<GenerateContentResponse>(async () => {

      console.log(`Start page ${key}`);
          
      const config = {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['الإسم بالعربي', 'الإسم باللغة الأجنبية', 'الرابط الأول', 'الرابط الثاني', 'الرابط الثالث'],
              properties: {
                ['الإسم بالعربي']: {
                  type: Type.STRING,
                },
                ['الإسم باللغة الأجنبية']: {
                  type: Type.STRING,
                },
                ['الرابط الأول']: {
                  type: Type.STRING,
                },
                ['الرابط الثاني']: {
                  type: Type.STRING,
                },
                ['الرابط الثالث']: {
                  type: Type.STRING,
                }
              },
            },
          },
          systemInstruction: [
              {
                text: instructions,
              }
          ],
        };

        const model = 'gemini-2.5-flash';

        const result = await ai.models.generateContent({
          model,
          config,
          contents: conversation.toMessages(),
        });

        return result;
    });

    if (result === undefined) return [];

    const responseObject: Omit<LineRow, 'رقم النص' | 'رقم الصفحة'>[] = JSON.parse(result.text as string);
    const lines: LineRow[] = responseObject.map((line, index) => ({ ...line, ['رقم الصفحة']: key, ['رقم النص']: index + 1 }));

    if ( responseObject.length === 0 ) return [];

    try {
      sheet.push(...lines);
    } catch (err) {
      console.error('Failed to parse assistant response:', responseObject, err);
    }

    // Add assistant message
    conversation.push({
      role: 'model',
      parts: [
        {
          text: result.text
        }
      ]
    });

    return lines;

  }

  return [sheet, extract] as const;
}