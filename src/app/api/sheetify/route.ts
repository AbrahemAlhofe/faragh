import { NextRequest, NextResponse } from 'next/server';
import { generateObject, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

const LLM_MODEL = google('gemini-2.5-flash-preview-04-17');

export async function POST(req: NextRequest) {
  try {
    const pageNumber = Number(req.nextUrl.searchParams.get('pageNumber'));
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415 });
    }

    // Parse the form data
    const formData = await req.formData();
    const image = formData.get('image') as File;

    if (!image) {
      return NextResponse.json({ error: 'No image uploaded' }, { status: 400 });
    }

    const { text: content } = await generateText({
      model: LLM_MODEL,
      messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Convert the following image to markdown directly without \'markdown```\' annotation:' },
              { type: 'image', image: Buffer.from(await image.arrayBuffer()) }
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

    return NextResponse.json({ result: lines.map((line, index) => ({ ...line, ['رقم الصفحة']: pageNumber, ['رقم النص']: index + 1 })) });
  } catch (error) {
    console.error('Error processing PDF:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
