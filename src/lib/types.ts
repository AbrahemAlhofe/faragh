type Row = {
  ['رقم الصفحة']: number;
  ['رقم النص']: number;
}

declare global {
  interface Window {
    pdfjsLib: PDFJs;
  }
}

export type LineRow = Row & {
  ['الشخصية']: string;
  ['النص']: string;
  ['النبرة']: string;
  ['المكان']: string;
  ['الخلفية الصوتية']: string;
  ['رقم الصفحة']: number;
  ['رقم النص']: number;
}

export type ForeignNameRow = Row & {
  ['الإسم بالعربي']: string;
  ['الإسم باللغة الأجنبية']: string;
  ['الرابط الأول']: string;
  ['الرابط الثاني']: string;
  ['الرابط الثالث']: string;
}

export enum SESSION_MODES {
  NAMES = 'names',
  LINES = 'lines'
}

export type Sheet<T extends Row> = T[];

export type SheetFile<T extends Row> = {
  pdfFilename: string;
  sheet: Sheet<T>;
}

export type Summary = string;

export type PDFJs = typeof import('pdfjs-dist');

export type Message = {
  role: string;
  parts: Array<{
    text?: string;
    fileData?: {
      fileUri: string;
      mimeType: string;
    };
    inlineData?: {
      data: string;
      mimeType: string;
    };
  }>;
}

export enum SESSION_STAGES {
  IDLE = 'IDLE',
  READY = 'READY',
  SCANNING = 'SCANNING',
  EXTRACTING = 'EXTRACTING'
}

export type SessionProgress<T> = {
  stage: SESSION_STAGES;
  cursor: number;
  progress: number;
  details: T;
}