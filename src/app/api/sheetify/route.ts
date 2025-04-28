import { NextRequest, NextResponse } from 'next/server';
import { generateObject, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import '@ungap/with-resolvers';
import { PDFPageProxy } from 'pdfjs-dist/types/web/interfaces';
import Redis from 'ioredis';
import { Line, SheetFile } from '@/lib/types';
import Mustache from 'mustache';
import Cache from '@/lib/cache';
import sharp from 'sharp';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function convertToImage (canvasFactory: any, page: PDFPageProxy) {
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

  await fs.writeFile(path.join('tmp', `${page.pageNumber}.png`), image, 'binary');

  return image;
}

async function convertToMarkdown (image: Buffer): Promise<{ characters: Array<{ name: string, description: string }>, content: string }> {

  try {
    
    const { text: content } = await generateText({
      model: google('gemini-2.5-flash-preview-04-17'),
      system: await fs.readFile(path.join('src/lib/prompts', 'markdownify.md'), 'utf-8'),
      messages: [
          {
            role: 'user',
            content: [
              { type: 'image', image: image }
            ],
          },
      ],
    });

    const { object: characters } = await generateObject({
      model: google('gemini-2.5-flash-preview-04-17'),
      system: await fs.readFile(path.join('src/lib/prompts', 'charactering.md'), 'utf-8'),
      schema: z.array(z.object({
          name: z.string(),
          description: z.string(),
      })),
      messages: [
          {
            role: 'user',
            content
          },
      ],
    });

    return { content, characters };

  } catch (error) {
    console.error('Error converting image to markdown');
    return { characters: [], content: '' };
  }

}

async function convertToLines(pageNumber: number, content: string, characters: string): Promise<Omit<Line, 'رقم الصفحة' | 'رقم النص'>[]> {

  try {

    const promptFile = await fs.readFile(path.join('src/lib/prompts', 'sheetify.md'), 'utf-8');
    const prompt = Mustache.render(promptFile, { characters });
    const { object: lines } = await generateObject({
      model: google('gemini-2.5-pro-preview-03-25'),
      schema: z.array(z.object({
        ['الشخصية']: z.string(),
        ['النص']: z.string(),
        ['النبرة']: z.string(),
        ['المكان']: z.string(),
        ['الخلفية الصوتية']: z.string(),
      })),
      system: prompt,
      messages: [
          { role: 'user', content: `الصفحة رقم ${pageNumber} : \n\n${content}` },
      ],
    });

    return lines;
  
  } catch (error) {
    
    console.log('Error converting markdown to lines', error);
    
    return [];

  }

}

export async function POST(req: NextRequest) {

  try {

    const startPage = parseInt(req.nextUrl.searchParams.get('startPage') || '1', 10);
    const endPage = parseInt(req.nextUrl.searchParams.get('endPage') || '1', 10);
    const sheetId = Math.random().toString(36).substring(2, 15);
    let sheet: Line[] = [];
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415 });
    }

    const formData = await req.formData();
    const pdf = formData.get('pdf') as File;

    if (!pdf) {
      return NextResponse.json({ error: 'No pdf uploaded' }, { status: 400 });
    }

    const arrayBuffer = await pdf.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const document = await getDocument({ data: uint8Array }).promise;
    let processedPages = 0;
    let currentPage = startPage;
    const BATCH_SIZE = Math.min(
      Math.max(Math.floor(Math.sqrt(document.numPages)), 5),
      25
    );
    const charactersCache = new Cache(25);
        
    // Collect all batches (each batch is a sequential processor)
    const batchProcessors: Promise<void>[] = [];
    
    while (currentPage <= document.numPages) {
      const batchStartPage = currentPage;
      const batchEndPage = Math.min(currentPage + BATCH_SIZE - 1, document.numPages);
    
      // Each batch is a sequential processor
      const batchPromise = (async () => {
        for (let pageNum = batchStartPage; pageNum <= batchEndPage; pageNum++) {
          const page = await document.getPage(pageNum);
          const canvasFactory = document.canvasFactory;
          const image = await convertToImage(canvasFactory, page);
          const { content, characters } = await convertToMarkdown(image);
          characters.forEach((character) => {
            charactersCache.add(character.name, character.description);
          });
          const lines = await convertToLines(page.pageNumber, content, charactersCache.toString());
          sheet.push(...lines.map((line, index) => ({
            ...line,
            ['رقم الصفحة']: page.pageNumber,
            ['رقم النص']: index + 1,
          })));
          processedPages += 1;
          console.log(`Page: ${page.pageNumber} | Progress: ${Math.round((processedPages / document.numPages) * 100)}%`);
        }
      })();
    
      batchProcessors.push(batchPromise);
    
      currentPage = batchEndPage + 1;
    }
    
    // Now run all batch processors in parallel
    await Promise.all(batchProcessors);

    console.log("Sorting lines...");

    sheet = sheet.sort((a, b) => {
      if (a['رقم الصفحة'] === b['رقم الصفحة']) {
        return a['رقم النص'] - b['رقم النص'];
      }
      return a['رقم الصفحة'] - b['رقم الصفحة'];
    });

    console.log("Saving lines...");

    const sheetFile: SheetFile = {pdfFilename: pdf.name, sheet};
    await redis.set(sheetId, JSON.stringify(sheetFile), 'EX', 60 * 60 * 24); // Store for 24 hours
    const sheetUrl = new URL(`/api/sheetify/${sheetId}`, req.url).toString();

    console.log("Done!");
    
    return NextResponse.json({ sheetUrl }, { status: 200 });
  } catch (error) {
    console.error('Error processing PDF:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
