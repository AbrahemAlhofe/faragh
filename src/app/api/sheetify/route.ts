import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import '@ungap/with-resolvers';
import Redis from 'ioredis';
import { SheetFile } from '@/lib/types';
import { useScanner, useSheeter } from '@/lib/serverHooks';
import { parallelReading } from '@/lib/utils';
import fs from 'fs/promises';
import path from 'path';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function POST(req: NextRequest) {
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

    const arrayBuffer = await pdf.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const document = await getDocument({ data: uint8Array }).promise;
    
    const canvasFactory = document.canvasFactory;
    const [images, scan] = useScanner(canvasFactory);
    await parallelReading(document.numPages, async (pageNum: number) => {
      const page = await document.getPage(pageNum);
      await scan(page);
    });

    const [sheet, extract] = useSheeter();
    for (let i = startPage; i <= endPage; i++) {
      await extract(i, images()[i - 1]);
      await fs.writeFile(path.join('tmp', 'conversation.json'), JSON.stringify(sheet, null, 2), 'utf-8');
    }

    const sheetFile: SheetFile = {pdfFilename: pdf.name, sheet};
    await redis.set(`${sheetId}-file`, JSON.stringify(sheetFile), 'EX', 60 * 60 * 24);
    const sheetUrl = new URL(`/api/sheetify/${sheetId}`, req.url).toString();

    return NextResponse.json({ sheetUrl }, { status: 200 });
}