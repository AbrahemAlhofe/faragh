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

  export function parallelForLoop(num: number, callback: (index: number) => Promise<void>, startingIndex: number = 1) {
    const promises: Promise<void>[] = [];
    for (let i = startingIndex; i < num; i++) {
      promises.push(callback(i));
    }
    return Promise.all(promises);
  }