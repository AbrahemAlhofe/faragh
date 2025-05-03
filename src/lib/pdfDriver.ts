import { DocumentInitParameters, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

const base64ToBlob = (base64Data: string, contentType: string = 'image/png'): Blob => {
  const byteCharacters = atob(base64Data.split(',')[1]);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);

    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
};

export class PDFPage {

  constructor (public proxy: PDFPageProxy) {}

  async scan (scale: number = 0.9): Promise<Blob> {
    const viewport = this.proxy.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
      canvasContext: context!,
      viewport: viewport,
    };

    await this.proxy.render(renderContext).promise;
    const imageData = canvas.toDataURL('image/png');
    return base64ToBlob(imageData, 'image/png');
  }

}

export class PDFDocument {

  constructor (public proxy: PDFDocumentProxy) {}

  async *[Symbol.asyncIterator](): AsyncIterator<PDFPage> {
    const numPages = this.proxy.numPages;
    for (let i = 1; i <= numPages; i++) {
      const page = await this.proxy.getPage(1);
      yield new PDFPage(page);
    }
  }

  async *range (startPage: number, endPage: number): AsyncIterable<PDFPage> {
    for (let i = startPage; i <= endPage; i++) {
      const page = await this.proxy.getPage(i);
      yield new PDFPage(page);
    }
  }


}

export default class PDFDriver {

  async read (file: File): Promise<PDFDocument> {

    const fileReader = new FileReader();
  
    return new Promise((resolve, reject) => {
      fileReader.onload = async () => {
        try {
          const typedArray = new Uint8Array(fileReader.result as ArrayBuffer);
          const pdf = await this.getDocument({ data: typedArray });
          resolve( new PDFDocument(pdf) );
        } catch (error) {
          reject(error);
        }
      };
  
      fileReader.onerror = (error) => reject(error);
      fileReader.readAsArrayBuffer(file);
    });

  }

  async readPage (file: File, pageNumber: number): Promise<PDFPage> {
    const fileReader = new FileReader();
  
    return new Promise((resolve, reject) => {
      fileReader.onload = async () => {
        try {
          const typedArray = new Uint8Array(fileReader.result as ArrayBuffer);
          const pdf = await this.getDocument({ data: typedArray });
  
          if (pageNumber < 1 || pageNumber > pdf.numPages) {
            throw new Error(`Invalid page number: ${pageNumber}. The document has ${pdf.numPages} pages.`);
          }
  
          const page = await pdf.getPage(pageNumber);
          resolve( new PDFPage(page) );
        } catch (error) {
          reject(error);
        }
      };
  
      fileReader.onerror = (error) => reject(error);
      fileReader.readAsArrayBuffer(file);
    });
  }

  async getDocument (documentInitParams: DocumentInitParameters): Promise<PDFDocumentProxy> {
    
    const pdfJs = await import('pdfjs-dist');

    pdfJs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();

    return await pdfJs.getDocument(documentInitParams).promise;

  }

  async scanPage (file: File, pageNumber: number, scale: number = 0.9): Promise<Blob> {
    const fileReader = new FileReader();
  
    return new Promise((resolve, reject) => {
      fileReader.onload = async () => {
        try {
          const typedArray = new Uint8Array(fileReader.result as ArrayBuffer);
          const pdf = await this.getDocument({ data: typedArray });
  
          if (pageNumber < 1 || pageNumber > pdf.numPages) {
            throw new Error(`Invalid page number: ${pageNumber}. The document has ${pdf.numPages} pages.`);
          }
  
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
  
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
  
          canvas.width = viewport.width;
          canvas.height = viewport.height;
  
          const renderContext = {
            canvasContext: context!,
            viewport: viewport,
          };
  
          await page.render(renderContext).promise;
          const imageData = canvas.toDataURL('image/png');
          resolve( base64ToBlob(imageData, 'image/png') );
        } catch (error) {
          reject(error);
        }
      };
  
      fileReader.onerror = (error) => reject(error);
      fileReader.readAsArrayBuffer(file);
    });
  };

}