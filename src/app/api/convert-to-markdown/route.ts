// app/api/process-pdf/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PDFContentProcessor } from '@/lib/pdfContentProcessor';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

export async function POST(req: NextRequest) {
  try {
    // Ensure the request has the correct content type
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415 });
    }

    // Parse the form data
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Save the uploaded file to a temporary location
    const tempFilePath = join(tmpdir(), `${uuidv4()}-${file.name}`);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(tempFilePath, buffer);

    const processor = new PDFContentProcessor();

    // Convert PDF to markdown
    const markdown = await processor.convertToMarkdown({ path: tempFilePath });

    // Convert markdown to dubbing script
    const dubbingScript = await processor.convertToDubbingScript({ content: markdown });

    // Clean up the temporary file
    await unlink(tempFilePath);

    return NextResponse.json({ markdown, dubbingScript });
  } catch (error) {
    console.error('Error processing PDF:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
