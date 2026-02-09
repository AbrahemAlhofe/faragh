import fs from 'fs/promises';
import path from 'path';
import '@ungap/with-resolvers';
import { LineRow } from '@/lib/types';
import { ReadingMemory, tryCall } from "./utils";
import { Type } from "@google/genai";
import { callAI, getAI, handleConversation } from "./ai";
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
      });

      const imageBuffer = await scanner(pageNumber, { responseType: 'buffer' });

      const buffer = imageBuffer?.buffer;
      if (!buffer) {
        throw new Error(`Failed to render page ${pageNumber} to image`);
      }

      const file = await tryCall(async () => await getAI().files.upload({
        file: new Blob([new Uint8Array(buffer)], { type: 'image/png' }),
        config: { mimeType: "image/png" }
      }));

      if (file === undefined) throw new Error('Failed to upload image to Google Cloud Storage');

      const uri = file.uri as string;
      imagesCache[pageNumber] = uri;

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

    const config = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: [
            "الشخصية",
            "النص",
            "النبرة",
            "المكان",
            "الخلفية الصوتية",
          ],
          properties: {
            ["الشخصية"]: {
              type: Type.STRING,
            },
            ["النص"]: {
              type: Type.STRING,
            },
            ["النبرة"]: {
              type: Type.STRING,
            },
            ["المكان"]: {
              type: Type.STRING,
            },
            ["الخلفية الصوتية"]: {
              type: Type.STRING,
            },
          },
        },
      },
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: instructions,
          },
        ],
      },
    };

    const model = "gemini-2.5-flash";

    const result = await callAI(model, config, conversation);
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

    const config = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: [
            "الإسم بالعربي",
            "الإسم باللغة الأجنبية",
            "الرابط الأول",
            "الرابط الثاني",
            "الرابط الثالث",
          ],
          properties: {
            ["الإسم بالعربي"]: {
              type: Type.STRING,
            },
            ["الإسم باللغة الأجنبية"]: {
              type: Type.STRING,
            },
            ["الرابط الأول"]: {
              type: Type.STRING,
            },
            ["الرابط الثاني"]: {
              type: Type.STRING,
            },
            ["الرابط الثالث"]: {
              type: Type.STRING,
            },
          },
        },
      },
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: instructions,
          },
        ],
      },
    };

    const model = "gemini-2.5-flash";

    const result = await callAI(model, config, conversation);
    const responseObject = handleConversation(result, conversation);

    const lines: LineRow[] = responseObject.map(
      (line: Omit<LineRow, "رقم النص" | "رقم الصفحة">, index: number) => ({
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