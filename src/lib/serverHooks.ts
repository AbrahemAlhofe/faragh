import fs from 'fs/promises';
import path from 'path';
import '@ungap/with-resolvers';
import { ForeignNameRow, LineRow, Row } from '@/lib/types';
import { ReadingMemory } from "./utils";

import { callAI, handleConversation } from "./ai";
import { fromBuffer } from 'pdf2pic';
import countPages from 'page-count';

export async function useScanner(
  pdf: File,
  scale: number = 1
): Promise<[
  (pageNumber?: number) => Record<number, string> | string, // get images cache or specific cached image
  number,
  (pageNumber: number) => Promise<string> // render page to image and cache it
]> {
  const imagesCache: Record<number, string> = {};
  const pdfBuffer = Buffer.from(await new Response(pdf).arrayBuffer());
  const numberOfPages = await countPages(pdfBuffer, 'pdf');

  return [
    (pageNumber?: number) =>
      pageNumber === undefined ? imagesCache : imagesCache[pageNumber],

    numberOfPages,

    async (pageNumber: number) => {

      const scanner = fromBuffer(pdfBuffer, {
        density: 72 * scale,
        width: 600 * scale,
        height: 800 * scale,
        format: 'png',
      });


      const imageBuffer = await scanner(pageNumber, { responseType: 'buffer' });

      if (!imageBuffer?.buffer || !Buffer.isBuffer(imageBuffer.buffer) || imageBuffer.buffer.length === 0) {
        throw new Error(`Invalid rendered buffer for page ${pageNumber}`);
      }

      const buffer = imageBuffer?.buffer;
      if (!buffer) {
        throw new Error(`Failed to render page ${pageNumber} to image`);
      }

      const base64 = Buffer.from(buffer).toString('base64');

      imagesCache[pageNumber] = base64;

      console.log({
        size: imageBuffer.size,
        mime: "image/png",
      });

      return base64;
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
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${image}`,
          }
        }
      ],
    })

    // System instruction must be sent as a system message at the beginning of the conversation.
    // We can just prepend it before sending to the model, or add it here if it's the first execution.
    if (conversation.toMessages().filter(m => m.role === 'system').length === 0) {
      conversation.toMessages().unshift({
        role: "system",
        content: instructions
      });
    }

    const config = {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "results_schema",
          strict: true,
          schema: {
            type: "object",
            required: ["results"],
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  required: [
                    "الشخصية",
                    "النص",
                    "النبرة",
                    "المكان",
                    "الخلفية الصوتية",
                  ],
                  properties: {
                    "الشخصية": { type: "string" },
                    "النص": { type: "string" },
                    "النبرة": { type: "string" },
                    "المكان": { type: "string" },
                    "الخلفية الصوتية": { type: "string" },
                  },
                  additionalProperties: false
                }
              }
            },
            additionalProperties: false
          }
        }
      }
    };

    // Fallback between flash and flash-lite models on failure
    const models = ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"] as const;
    let result: any;
    for (const m of models) {
      try {
        result = await callAI(m, config, conversation);
        break;
      } catch (err) {
        console.warn(`Model ${m} failed, trying next if available`, err);
        if (m === models[models.length - 1]) throw err;
      }
    }
    const responseObject = handleConversation(result, conversation);

    const lines: LineRow[] = responseObject.map(
      (line: Omit<LineRow, "رقم النص" | "رقم الصفحة">, index: number) => ({
        ...line,
        ["رقم الصفحة"]: key,
        ["رقم النص"]: index + 1,
      })
    );

    try {
      sheet.push(...lines);
    } catch (err) {
      console.error(
        "Failed to parse assistant response:",
        responseObject,
        err
      );
    }

    return lines;

  }

  return [sheet, extract] as const;
}

export async function useForeignNamesExtractor({ readingMemoryLimit }: { readingMemoryLimit: number } = { readingMemoryLimit: 10 }): Promise<[ForeignNameRow[], (key: number, image: string) => Promise<ForeignNameRow[]>]> {
  const conversation: ReadingMemory = new ReadingMemory(readingMemoryLimit ?? 10);
  const sheet: ForeignNameRow[] = [];
  const instructions = await fs.readFile(path.join('src/lib/prompts', 'foreign-name-extraction.md'), 'utf-8');

  async function extract(key: number, image: string): Promise<ForeignNameRow[]> {

    conversation.push({
      role: 'user',
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${image}`,
          }
        }
      ],
    })

    if (conversation.toMessages().filter(m => m.role === 'system').length === 0) {
      conversation.toMessages().unshift({
        role: "system",
        content: instructions
      });
    }

    const config = {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "results_schema",
          strict: true,
          schema: {
            type: "object",
            required: ["results"],
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  required: [
                    "الإسم بالعربي",
                    "الإسم باللغة الأجنبية",
                    "الرابط الأول",
                    "الرابط الثاني",
                    "الرابط الثالث",
                  ],
                  properties: {
                    "الإسم بالعربي": { type: "string" },
                    "الإسم باللغة الأجنبية": { type: "string" },
                    "الرابط الأول": { type: "string" },
                    "الرابط الثاني": { type: "string" },
                    "الرابط الثالث": { type: "string" },
                  },
                  additionalProperties: false
                }
              }
            },
            additionalProperties: false
          }
        }
      }
    };

    const model = "google/gemini-2.5-flash";

    const result = await callAI(model, config, conversation);
    const responseObject = handleConversation(result, conversation);

    const lines: ForeignNameRow[] = responseObject.map(
      (line: Omit<ForeignNameRow, "رقم النص" | "رقم الصفحة">, index: number) => ({
        ...line,
        ["رقم الصفحة"]: key,
        ["رقم النص"]: index + 1,
      })
    );

    if (responseObject.length === 0) return [];

    try {
      sheet.push(...lines);
    } catch (err) {
      console.error(
        "Failed to parse assistant response:",
        responseObject,
        err
      );
    }

    return lines;

  }

  return [sheet, extract] as const;
}