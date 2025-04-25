import fs from 'fs/promises';
import { generateObject, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { pdf } from 'pdf-to-img';

type Line = {
  character: string;
  line: string;
  page: number;
  tone: string;
  place: string;
}

export class PDFContentProcessor {
  private model = google('gemini-2.5-pro-preview-03-25');

  async convertToMarkdown({ path }: { path: string }): Promise<string[]> {

    const document = await pdf(path, { scale: 0.9 });
    let counter = 1;
    const imagePaths: string[] = [];

    for await (const image of document) {
        const imagePath = `./tmp/image-${counter}.png`;
        await fs.writeFile(imagePath, image);
        imagePaths.push(imagePath);
        counter++;
    }

    let markdownContent = [];

    for (const imagePath of imagePaths) {
      const result = await generateText({
        model: this.model,
        messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Convert the following image to markdown directly without \'markdown```\' annotation:' },
                { type: 'image', image: await fs.readFile(imagePath) }
              ],
            },
        ],
      });

      markdownContent.push(result.text);
    }

    for (const imagePath of imagePaths) {
      await fs.unlink(imagePath);
    }

    return markdownContent;
  }

  async convertToDubbingScript({ content }: { content: string[] }): Promise<string[]> {

    let sheet: Array<Line> = [];

    for (let i = 0; i < content.length; i++) {
      const pageCount = i + 1;
      const page = content[i];
      const { object: lines } = await generateObject({
        model: this.model,
        schema: z.array(z.object({
          character: z.string(),
          line: z.string(),
          tone: z.string(),
          place: z.string(),
        })),
        messages: [
            {
              role: 'user',
              content: 'Convert the following image to markdown'
            },
            {
              role: 'user',
              content: 'Convert the following image to markdown'
            },
        ],
      });

      sheet.push(...lines.map(line => ({ ...line, page: pageCount })));
    }

    return content;
  }

}
