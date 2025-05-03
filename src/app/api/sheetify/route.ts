import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import '@ungap/with-resolvers';
import Redis from 'ioredis';
import { SheetFile } from '@/lib/types';
import { useOCR, useScanner, useSheeter, useSummary } from '@/lib/serverHooks';
import { parallelReading } from '@/lib/utils';
import fs from 'fs';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function POST(req: NextRequest) {
  try {
    const startPage = parseInt(req.nextUrl.searchParams.get('startPage') || '1', 10);
    const endPage = parseInt(req.nextUrl.searchParams.get('endPage') || '1', 10);
    const sheetId = Math.random().toString(36).substring(2, 15);
    const contentType = req.headers.get('content-type') || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415 });
    }

    const formData = await req.formData();
    const pdf = formData.get('pdf') as File;

    if (!pdf) {
      return NextResponse.json({ error: 'No pdf uploaded' }, { status: 400 });
    }

    if (!fs.existsSync(process.env.TMPDIR || '/tmp')) fs.mkdirSync(tmp);

    const arrayBuffer = await pdf.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const document = await getDocument({ data: uint8Array }).promise;
    
    console.log("Scanning pages...");
    const canvasFactory = document.canvasFactory;
    const [images, scan] = useScanner(canvasFactory);
    await parallelReading(document.numPages, async (pageNum: number) => {
      
      const page = await document.getPage(pageNum);
      await scan(page);
      
    }, startPage);
    
    console.log("Extracting text from pages...");
    const [content, extract] = useOCR();
    await parallelReading(document.numPages, async (pageNum: number) => {

      await extract(pageNum, images()[pageNum - 1]);

    }, startPage);

    console.log("Summarizing text...");
    const [summary, summarize] = useSummary();
    for (let pageNum = startPage; pageNum <= document.numPages; pageNum++) {
      
      await summarize(content()[pageNum - 1]);

    }
    
    console.log("Starting page sheetifing...");
    const [sheet, sheetify] = useSheeter(summary());
    await parallelReading(document.numPages, async (pageNum: number) => {
              
      await sheetify(pageNum, content()[pageNum - 1]);
        
    }, startPage);
    
    console.log("Sorting lines...");

    console.log("Saving lines...");
    const sheetFile: SheetFile = {pdfFilename: pdf.name, sheet: sheet()};
    await redis.set(`${sheetId}-file`, JSON.stringify(sheetFile), 'EX', 60 * 60 * 24);
    const sheetUrl = new URL(`/api/sheetify/${sheetId}`, req.url).toString();

    console.log("Done!");
    return NextResponse.json({ sheetUrl }, { status: 200 });
  } catch (error) {
    console.error('Error processing PDF:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}