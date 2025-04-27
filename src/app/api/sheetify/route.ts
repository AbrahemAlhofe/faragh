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

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const LLM_MODEL = google('gemini-2.5-flash-preview-04-17');

async function convertToImage (canvasFactory: any, page: PDFPageProxy) {
  // Render the page on a Node canvas with 100% scale.
  const viewport = page.getViewport({ scale: 0.5 });
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

  return canvasAndContext.canvas.toBuffer("image/png");
}

async function parsePage (image: Buffer) {

  const { text: content } = await generateText({
    model: LLM_MODEL,
    messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Convert the following image to markdown directly without \'markdown```\' annotation:' },
            { type: 'image', image: image }
          ],
        },
    ],
  });

  const { object: lines } = await generateObject({
    model: LLM_MODEL,
    schema: z.array(z.object({
      ['الشخصية']: z.string(),
      ['النص']: z.string(),
      ['النبرة']: z.string(),
      ['المكان']: z.string(),
      ['الخلفية الصوتية']: z.string(),
    })),
    system: await fs.readFile(path.join('src/lib/prompts', 'sheetify.md'), 'utf-8'),
    messages: [
        { role: 'user', content },
    ],
  });

  return lines;

}

export async function POST(req: NextRequest) {

  try {

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
    const requests: Promise<void>[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {

      const _pageNumber = pageNumber;

      requests.push(new Promise(async (resolve) => {
        const page = await document.getPage(_pageNumber);
        const canvasFactory = document.canvasFactory;
        const image = await convertToImage(canvasFactory, page);
        const lines = await parsePage(image);
        sheet.push(...lines.map((line, index) => ({ ...line, ['رقم الصفحة']: page.pageNumber, ['رقم النص']: index + 1 })));
        resolve();
        console.log(`Page ${page.pageNumber} processed`);
      }));

    }

    await Promise.all(requests);

    sheet = sheet.sort((a, b) => {
      if (a['رقم الصفحة'] === b['رقم الصفحة']) {
        return a['رقم النص'] - b['رقم النص'];
      }
      return a['رقم الصفحة'] - b['رقم الصفحة'];
    });

    const sheetFile: SheetFile = {pdfFilename: pdf.name, sheet};
    await redis.set(sheetId, JSON.stringify(sheetFile), 'EX', 60 * 60 * 24); // Store for 24 hours
    const sheetUrl = new URL(`/api/sheetify/${sheetId}`, req.url).toString();

    return NextResponse.json({ sheetUrl }, { status: 200 });
  } catch (error) {
    console.error('Error processing PDF:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
