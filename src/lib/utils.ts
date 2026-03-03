import { Message } from "./types";
import * as XLSX from 'xlsx';

const ARTICLES = new Set(["a", "an", "the", "and", "of", "for"]);

export function normalizeEnglishName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")          // remove punctuation
    .split(/\s+/)                         // words
    .filter((w) => w && !ARTICLES.has(w)) // drop articles
    .join(" ")
    .trim();
}

export function filterSimilarEnglishNames<T extends { ["الإسم باللغة الأجنبية"]?: string }>(
  sheet: T[]
): T[] {
  const seen = new Set<string>(); // to set unique normalized names
  return sheet.filter((row) => {
    const raw = row["الإسم باللغة الأجنبية"] ?? "";
    const norm = normalizeEnglishName(raw);
    if (!norm) return true;            // keep rows with an empty name
    if (seen.has(norm)) return false;   // duplicate
    seen.add(norm); // after checking, add to seen
    return true;
  });
}

export function convertToCSV(data: any[]): string {
    if (data.length === 0) return "";

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","), // header row
      ...data.map(row =>
        headers.map(field => {
          const value = row[field] ?? "";
          const escaped = String(value).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(",")
      ),
    ];

    return csvRows.join("\r\n");
  }

export function convertToXLSX(data: any[]): Uint8Array {

  if (data.length === 0) {
    // Create empty workbook if no data
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  }

  // Convert JSON to worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);

  const headers = Object.keys(data[0]);
  const linkColumns = ['الرابط الأول', 'الرابط الثاني', 'الرابط الثالث'];

  const linkIndexes = linkColumns
  .map(col => headers.indexOf(col))
  .filter(index => index !== -1);


  const range = XLSX.utils.decode_range(worksheet["!ref"]!);

  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    for (const colIndex of linkIndexes) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIndex });
      const cell = worksheet[cellAddress];

      // Only add hyperlink if cell has a valid URL
      if (cell && cell.v && typeof cell.v === 'string') {
        const url = cell.v.trim();
        // Check if it's a valid URL (starts with http:// or https://)
        if (url.startsWith('http://') || url.startsWith('https://')) {
          cell.l = { Target: url, Tooltip: url };
          // Ensure the display text is set to the URL
          cell.v = url;
        }
      }
    }
  }

  // Create workbook and add worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  // Generate buffer
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}

  export function parallelReading(num: number, callback: (index: number) => Promise<void>, startingIndex: number = 1) {
    const promises: Promise<void>[] = [];
    for (let i = startingIndex; i <= num; i++) {
      promises.push(callback(i));
    }
    return Promise.all(promises);
  }

  export function base64ToBlob (base64Data: string, contentType: string = 'image/png'): Blob {
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


  export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  export async function tryCall<T>(callback: (...args: any[]) => Promise<T>, delay: number = 1000) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await callback();
      } catch (error) {
        console.warn(`[ ERROR ] try again ${3 - attempt} times more : `, error);
        if (attempt === 3) {
          throw error; // or throw error
        }
        await sleep(delay * attempt);
      }
    }
  }

export class ReadingMemory {
  private memory: Message[] = [];
  private maxLength: number;

  constructor(maxLength: number) {
    this.maxLength = maxLength;
  }

  push(message: Message) {
    this.memory.push(message);
    while (this.memory.length > this.maxLength * 2) this.memory.splice(0, 2);
  }

  toMessages(): Message[] {
    return this.memory;
  }

  clear() {
    this.memory = [];
  }
}


export function encodeRFC5987ValueChars(filename: string) {
  return encodeURIComponent(filename)
    .replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}