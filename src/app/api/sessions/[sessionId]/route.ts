import { NextRequest, NextResponse } from "next/server";
import { ForeignNameRow, LineRow, SESSION_MODES, SESSION_STAGES, SessionProgress, SheetFile } from "@/lib/types";
import { useForeignNamesExtractor, useScanner, useSheeter } from "@/lib/serverHooks";
import { convertToXLSX, filterSimilarEnglishNames, normalizeEnglishName, parallelReading } from "@/lib/utils";
import { getRedis } from "@/lib/redis";

async function validateLink(url: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch(url, { method: "HEAD", signal });
    return response.ok ? url : "Not Found";
  } catch (error: any) {
    // Return "Not Found" for abort errors as well
    if (error.name === "AbortError") {
      throw error; // Re-throw abort errors to propagate up
    }
    return "Not Found";
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {

  const signal = req.signal;
  
  // Check if already aborted
  if (signal.aborted) {
    return new NextResponse("Client connection aborted", { status: 499 });
  }

  const { sessionId } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File;
  let sheetFile: SheetFile<ForeignNameRow> | SheetFile<LineRow> = { pdfFilename: file.name, sheet: [] };

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  try {
    // Check abort signal before starting processing
    signal.throwIfAborted();

    const startPage = parseInt(
      req.nextUrl.searchParams.get("startPage") || "1",
      10
    );
    const endPage = parseInt(req.nextUrl.searchParams.get("endPage") || "1", 10);
    const mode: SESSION_MODES = req.nextUrl.searchParams.get("mode") as SESSION_MODES || SESSION_MODES.NAMES;
    
    console.log(`\n=== POST REQUEST START ===`);
    console.log(`[POST] sessionId: ${sessionId}`);
    console.log(`[POST] mode: ${mode}`);
    console.log(`[POST] pages: ${startPage}-${endPage}`);
    
    const totalPages = endPage - startPage + 1;
    const contentType = req.headers.get("content-type") || "";
    const sessionProgress: SessionProgress<{}> = { stage: SESSION_STAGES.IDLE, cursor: 1, progress: 0, details: [] }

    await getRedis().set(
      `${sessionId}/progress`,
      JSON.stringify(sessionProgress)
    );

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Unsupported Media Type" },
        { status: 415 }
      );
    }

    const [images, numberOfPages, scan] = await useScanner(file);
    const scannedPages = [];
    await parallelReading(numberOfPages, async (pageNum: number) => {
      signal.throwIfAborted(); // Check before scanning each page
      if ( pageNum < startPage || pageNum > endPage ) return;
      await scan(pageNum);
      scannedPages.push(pageNum);
      await getRedis().set(`${sessionId}/progress`, JSON.stringify({ stage: "SCANNING", cursor: pageNum, progress: Math.floor((scannedPages.length / totalPages) * 100), details: "" }));
    });

    if (mode === SESSION_MODES.NAMES) {
      console.log(`[POST NAMES] Starting extraction...`);

      const [_sheet, extract] = await useForeignNamesExtractor({ readingMemoryLimit: 100 });
      sheetFile = { pdfFilename: file.name, sheet: _sheet };
      console.log(`[POST NAMES] Initial sheet from extractor: ${sheetFile.sheet.length} rows`);
      
      const seenNames = new Set<string>(); // Track normalized names we've already added
      
      for (let i = startPage; i <= endPage; i++) {
        signal.throwIfAborted(); // Check before processing each page
        const image = images(i) as string;
        const lines = await extract(i, image);
        const validateLines = await Promise.all(
          lines.map( async line => {
            if(line["الرابط الأول"]) line["الرابط الأول"] = await validateLink(line["الرابط الأول"], signal);
            if(line["الرابط الثاني"]) line["الرابط الثاني"] = await validateLink(line["الرابط الثاني"], signal);
            if(line["الرابط الثالث"]) line["الرابط الثالث"] = await validateLink(line["الرابط الثالث"], signal);
            return line;
          })
        )
        
        // Filter out duplicates before adding to sheet
        const uniqueLines = validateLines.filter((line) => {
          const englishName = line["الإسم باللغة الأجنبية"] ?? "";
          const normalized = normalizeEnglishName(englishName);
          
          console.log(`[EXTRACT] Raw: "${englishName}" | Normalized: "${normalized}" | Already seen: ${seenNames.has(normalized)}`);
          
          if (!normalized) {
            // Keep rows with no English name
            console.log(`[EXTRACT] -> KEEPING (empty name)`);
            return true;
          }
          
          if (seenNames.has(normalized)) {
            // Skip if we already have this normalized name
            console.log(`[EXTRACT] -> SKIPPING (duplicate)`);
            return false;
          }
          
          // First time seeing this name, add to set and keep the row
          seenNames.add(normalized);
          console.log(`[EXTRACT] -> KEEPING (new)`);
          return true;
        });
        
        console.log(`[EXTRACT] Page ${i}: Extracted ${validateLines.length}, Keeping ${uniqueLines.length}, Duplicates removed: ${validateLines.length - uniqueLines.length}`);
        sheetFile.sheet.push(...uniqueLines);
        await getRedis().set(`${sessionId}/progress`, JSON.stringify({ stage: "EXTRACTING", cursor: i, progress: Math.round(((i - startPage + 1) / totalPages) * 100), details: JSON.stringify(uniqueLines) }));
      }

    }

    if (mode === SESSION_MODES.LINES) {

      const [_sheet, extract] = await useSheeter({ readingMemoryLimit: 15 });
      sheetFile =  { pdfFilename: file.name, sheet: _sheet };
      for (let i = startPage; i <= endPage; i++) {
        signal.throwIfAborted(); // Check before processing each page
        const image = images(i) as string;
        const lines = await extract(i, image);
        await getRedis().set(`${sessionId}/progress`, JSON.stringify({ stage: "EXTRACTING", cursor: i, progress: Math.round(((i - startPage + 1) / totalPages) * 100), details: JSON.stringify(lines) }));
      }
    
    }

    console.log(`[POST] Final sheet size: ${sheetFile.sheet.length} rows`);
    console.log(`[POST] Saving to Redis at key: ${sessionId}/sheet`);
    
    await getRedis().set(
      `${sessionId}/sheet`,
      JSON.stringify(sheetFile),
      "EX",
      60 * 60 * 5
    );
    // Use host header instead of origin to avoid 0.0.0.0 in Docker
    const protocol = req.nextUrl.protocol;
    const host = req.headers.get("host") || req.nextUrl.host;
    const sheetUrl = `${protocol}//${host}/api/sessions/${sessionId}`;
  
    return NextResponse.json({ sheetUrl }, { status: 200 });

  } catch (error: any) {
    // Handle client abort
    if (error.name === "AbortError") {
      console.log(`[POST] Client connection aborted for sessionId: ${sessionId}`);
      return new NextResponse("Client connection aborted", { status: 499 });
    }

    if (error.type === "GEMINI_INVALID_INPUT") {
      return NextResponse.json({ type: "GEMINI_INVALID_INPUT" }, { status: 400 });
    }

    await getRedis().set(
      `${sessionId}/sheet`,
      JSON.stringify(sheetFile),
      "EX",
      60 * 60 * 5
    );
    // Use host header instead of origin to avoid 0.0.0.0 in Docker
    const protocol = req.nextUrl.protocol;
    const host = req.headers.get("host") || req.nextUrl.host;
    const sheetUrl = `${protocol}//${host}/api/sessions/${sessionId}`;

    return NextResponse.json({
      error: "An error occurred",
      details: error instanceof Error
        ? error.message
        : error,
      sheetUrl
    }, { status: 500 });

  }

}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "No sessionId provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sheetFileContent = await getRedis().get(`${sessionId}/sheet`);

  if (!sheetFileContent) {
    return new Response(JSON.stringify({ error: "Sheet not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sheetFile: SheetFile<ForeignNameRow>;
  try {
    sheetFile = JSON.parse(sheetFileContent) as SheetFile<ForeignNameRow>;
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: "Invalid JSON data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { pdfFilename, sheet } = sheetFile;

  // Ensure jsonData is an array
  const dataArray = Array.isArray(sheet) ? sheet : [sheet];

  console.log(`[GET /api/sessions/${sessionId}] Starting download...`);
  console.log(`[GET] Data array length BEFORE filter: ${dataArray.length}`);
  
  const filtered = filterSimilarEnglishNames(dataArray);
  
  console.log(`[GET] Data array length AFTER filter: ${filtered.length}`);
  console.log(`[GET] Removed ${dataArray.length - filtered.length} duplicate rows`);
  
  const xlsxBuffer = convertToXLSX(filtered);

  const filename = `${pdfFilename.replace(".pdf", "")}.xlsx`;

  return new Response(new Uint8Array(xlsxBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        filename
      )}"`,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {

  const { sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json({ error: "No sessionId provided" }, { status: 400 });
  }

  await getRedis().del(`${sessionId}/progress`);
  await getRedis().del(`${sessionId}/sheet`);

  return NextResponse.json({ success: true }, { status: 200 });
}