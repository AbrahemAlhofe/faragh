import { Message } from "./types";
import * as XLSX from 'xlsx';

const ARTICLES = new Set(["a", "an", "the", "and", "of", "for", "in", "on", "to", "is", "at", "by"]);

export function normalizeEnglishName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')              // remove all punctuation/special chars
    .split(/\s+/)                         // split into words
    .filter((w) => w && !ARTICLES.has(w)) // remove articles and empty strings
    .sort()                               // sort words alphabetically to handle different orders
    .join('|');                           // join with special separator for clarity
}

export function filterSimilarEnglishNames<T extends { ["الإسم باللغة الأجنبية"]?: string }>(
  sheet: T[]
): T[] {
  const seen = new Set<string>();
  const filtered: T[] = [];
  
  for (const row of sheet) {
    const raw = row["الإسم باللغة الأجنبية"] ?? "";
    const norm = normalizeEnglishName(raw);
    
    // Debug log
    if (raw) console.log(`[FILTER] "${raw}" -> "${norm}"`);
    
    if (!norm) {
      // Keep rows with empty English names
      filtered.push(row);
      continue;
    }
    
    if (seen.has(norm)) {
      console.log(`[FILTER] Duplicate detected, skipping`);
      continue;
    }
    
    console.log(`[FILTER] NEW - keeping this row`);
    seen.add(norm);
    filtered.push(row);
  }
  
  console.log(`[FILTER] Total rows: ${sheet.length}, Filtered rows: ${filtered.length}`);
  return filtered;
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

         const message = error instanceof Error ? error.message : String(error);
        if (message.includes("INVALID_ARGUMENT") || message.includes("Unable to process input image")) {
        throw Object.assign(new Error("GEMINI_INVALID_INPUT"), { type: "GEMINI_INVALID_INPUT" });
      }
        if(attempt === 3)
          throw error;
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