import { Message } from "./types";

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

  export async function tryCall<T>(callback: (...args: any[]) => Promise<T>) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await callback();
      } catch (error) {
        console.warn(`[ ERROR ] try again ${3 - attempt} times more`);
        if (attempt === 3) {
          throw error; // or throw error
        }
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
