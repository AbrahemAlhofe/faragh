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