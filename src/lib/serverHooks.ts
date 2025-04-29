import { generateObject, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import '@ungap/with-resolvers';
import { PDFPageProxy } from 'pdfjs-dist/types/web/interfaces';
import { Line, Summary } from '@/lib/types';
import Mustache from 'mustache';

export function useSummary (): [() => Summary, (content: string) => Promise<string>] {

  var cache: Summary = "";

  return [() => cache, async (content: string): Promise<string> => {

    const promptFile = await fs.readFile(path.join('src/lib/prompts', 'summarize.md'), 'utf-8')
    const prompt = Mustache.render(promptFile, { summary: cache });
    const { text: summary } = await generateText({
      model: google('gemini-2.5-pro-preview-03-25'),
      messages: [
          { role: 'user', content: `قم بتخليص الأحداث التالية مراعيا الشخصيات, الأماكن و الأحداث الرئيسية : ${cache + "\n\n" + content} \n\n\n. أجب مباشرة بالملخص دون إضافة عنوان أو ماشابه` },
      ],
    });

    cache = summary;

    await fs.writeFile(path.join('tmp', `summary.md`), summary, 'utf-8');

    return summary;

  }]

}

export function useScanner (canvasFactory: any): [() => Buffer[], (page: PDFPageProxy) => Promise<Buffer>] {
  
  const imagesCache: Buffer[] = [];

  return [() => imagesCache, async (page: PDFPageProxy) => {

    const isImageCached = await fs.stat(path.join('tmp', `${page.pageNumber}.png`)).then(() => true).catch(() => false);

    if (isImageCached) {

      const image = await fs.readFile(path.join('tmp', `${page.pageNumber}.png`));
      
      imagesCache.push(image);

      return image;

    }
  
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

    imagesCache.push(image);
  
    return image;

  }]

}

export function useOCR (): [() => string[], (pageNumber: number, image: Buffer) => Promise<string>] {

  const contentCache: string[] = [];

  return [() => contentCache, async (pageNumber: number, image: Buffer) => {

    try {
      
      const isCached = await fs.stat(path.join('tmp', `${pageNumber}.md`)).then(() => true).catch(() => false);

      if (isCached) {
        
        const content = await fs.readFile(path.join('tmp', `${pageNumber}.md`), 'utf-8');
        contentCache.push(content);
        
        return content;

      }

      const { text: content } = await generateText({
        model: google('gemini-2.5-flash-preview-04-17'),
        system: await fs.readFile(path.join('src/lib/prompts', 'markdownify.md'), 'utf-8'),
        messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: "أنت تقرأ الأن الصفحة رقم " + pageNumber },
                { type: 'image', image: image }
              ],
            },
        ],
      });

      // cache content
      await fs.writeFile(path.join('tmp', `${pageNumber}.md`), content, 'utf-8');

      return content;

    } catch (error) {
      console.error('Error converting image to markdown', error);
      return ""
    }

  }];

}

export function useSheeter(summary: string): [() => Line[], (pageNumber: number, content: string) => Promise<Omit<Line, 'رقم الصفحة' | 'رقم النص'>[]>] {

  const sheet: Line[] = [];
  
  return [
    
    () => sheet.sort((a, b) => {
          if (a['رقم الصفحة'] === b['رقم الصفحة']) {
            return a['رقم النص'] - b['رقم النص'];
          }
          return a['رقم الصفحة'] - b['رقم الصفحة'];
    }),
    
    async (pageNumber: number, content: string): Promise<Omit<Line, 'رقم الصفحة' | 'رقم النص'>[]> => {
    
      try {

        const promptFile = await fs.readFile(path.join('src/lib/prompts', 'sheetify.md'), 'utf-8');
        const prompt = Mustache.render(promptFile, { summary });
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

        const linesWithPageNumber = lines.map((line: Omit<Line, 'رقم الصفحة' | 'رقم النص'>, index: number) => ({
          ...line,
          'رقم الصفحة': pageNumber,
          'رقم النص': index + 1,
        }));

        sheet.push(...linesWithPageNumber);

        return lines;
      
      } catch (error) {
        
        console.log('Error converting markdown to lines', error);
        
        return [];

      }

  }];

}