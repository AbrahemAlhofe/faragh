import { NextRequest, NextResponse } from "next/server";
import { ForeignNameRow, LineRow, SESSION_MODES, SESSION_STAGES, SessionProgress, SheetFile } from "@/lib/types";
import { useForeignNamesExtractor, useScanner, useSheeter } from "@/lib/serverHooks";
import { convertToXLSX, filterSimilarEnglishNames, limitConcurrency, normalizeEnglishName, parallelReading } from "@/lib/utils";
import { getRedis } from "@/lib/redis";
import fs from "fs/promises";
import path from "path";

async function updateSessionStatus(sessionId: string, status: string) {
  const raw = await getRedis().hget('sessions:metadata', sessionId);
  if (!raw) return;

  const meta = JSON.parse(raw);
  meta.status = status;

  await getRedis().hset('sessions:metadata', sessionId, JSON.stringify(meta));
}

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
  let processedPages: number[] = [];

  const existingSheet = await getRedis().get(`${sessionId}/sheet`);
  if (existingSheet) {
    try {
      sheetFile = JSON.parse(existingSheet);
    } catch { }
  }

  const existingState = await getRedis().get(`${sessionId}/state`);
  if (existingState) {
    try {
      processedPages = JSON.parse(existingState).processedPages || [];
    } catch { }
  }

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  // Save PDF locally for persistence
  const storageDir = path.join(process.cwd(), "storage", "pdfs");
  await fs.mkdir(storageDir, { recursive: true });
  const pdfPath = path.join(storageDir, `${sessionId}.pdf`);
  const fileArrayBuffer = await file.arrayBuffer();
  await fs.writeFile(pdfPath, Buffer.from(fileArrayBuffer));

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

    // Update session metadata and index it
    await getRedis().hset('sessions:metadata', sessionId, JSON.stringify({
      filename: file.name,
      createdAt: Date.now(),
      status: "processing"
    }));

    await getRedis().sadd('sessions:index', sessionId);

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
    const scannedPages: number[] = [];
    const pagesToScan = [];
    for (let pageNum = 1; pageNum <= numberOfPages; pageNum++) {
      if (pageNum >= startPage && pageNum <= endPage && !processedPages.includes(pageNum)) {
        pagesToScan.push(pageNum);
      }
    }

    await limitConcurrency(10, pagesToScan.map(pageNum => async () => {
      signal.throwIfAborted();
      await scan(pageNum);
      scannedPages.push(pageNum);
      await getRedis().set(`${sessionId}/progress`, JSON.stringify({
        stage: "SCANNING",
        cursor: pageNum,
        progress: Math.floor((scannedPages.length / pagesToScan.length) * 100),
        details: ""
      }));
    }));

    if (mode === SESSION_MODES.NAMES) {
      console.log(`[POST NAMES] Starting extraction...`);

      const [_sheet, extract] = await useForeignNamesExtractor({ readingMemoryLimit: 1 });
      if (!sheetFile || !sheetFile.sheet) {
        sheetFile = { pdfFilename: file.name, sheet: [] };
      } else {
        sheetFile.pdfFilename = file.name;
      }
      console.log(`[POST NAMES] Initial sheet from extractor: ${sheetFile.sheet.length} rows`);

      const seenNames = new Set<string>(); // Track normalized names we've already added

      const pagesToProcess = [];
      for (let i = startPage; i <= endPage; i++) {
        if (!processedPages.includes(i)) pagesToProcess.push(i);
      }

      await limitConcurrency(5, pagesToProcess.map(i => async () => {
        signal.throwIfAborted();
        const image = images(i) as string;
        // Pass a snapshot of the current sheet to maintain context without image bloat
        const lines = await extract(i, image, sheetFile.sheet);

        const validateLines = await Promise.all(
          lines.map(async line => {
            if (line["الرابط الأول"]) line["الرابط الأول"] = await validateLink(line["الرابط الأول"], signal);
            if (line["الرابط الثاني"]) line["الرابط الثاني"] = await validateLink(line["الرابط الثاني"], signal);
            if (line["الرابط الثالث"]) line["الرابط الثالث"] = await validateLink(line["الرابط الثالث"], signal);
            return line;
          })
        );

        // Filter out duplicates
        const uniqueLines = validateLines.filter((line) => {
          const englishName = line["الإسم باللغة الأجنبية"] ?? "";
          const normalized = normalizeEnglishName(englishName);
          if (!normalized) return true;
          if (seenNames.has(normalized)) return false;
          seenNames.add(normalized);
          return true;
        });

        sheetFile.sheet.push(...uniqueLines);
        sheetFile.sheet.sort((a, b) => (a['رقم الصفحة'] - b['رقم الصفحة']) || (a['رقم النص'] - b['رقم النص']));
        processedPages.push(i);

        // Update Redis
        await getRedis().set(`${sessionId}/state`, JSON.stringify({ processedPages, mode }), "EX", 60 * 60 * 5);
        if (uniqueLines.length > 0) {
          await getRedis().set(`${sessionId}/sheet`, JSON.stringify(sheetFile), "EX", 60 * 60 * 5);
        }
        await getRedis().set(`${sessionId}/progress`, JSON.stringify({
          stage: "EXTRACTING",
          cursor: i,
          progress: Math.round(((processedPages.length / totalPages) * 100)),
          details: JSON.stringify(uniqueLines)
        }));
      }));

      // Final save of the full sheet and state with mode
      await getRedis().set(`${sessionId}/state`, JSON.stringify({ processedPages, mode }), "EX", 60 * 60 * 5);
      await getRedis().set(`${sessionId}/sheet`, JSON.stringify(sheetFile), "EX", 60 * 60 * 5);

    }

    if (mode === SESSION_MODES.LINES) {

      const [_sheet, extract] = await useSheeter({ readingMemoryLimit: 1 });
      if (!sheetFile || !sheetFile.sheet) {
        sheetFile = { pdfFilename: file.name, sheet: [] };
      } else {
        sheetFile.pdfFilename = file.name;
      }
      const pagesToProcess = [];
      for (let i = startPage; i <= endPage; i++) {
        if (!processedPages.includes(i)) pagesToProcess.push(i);
      }

      await limitConcurrency(5, pagesToProcess.map(i => async () => {
        signal.throwIfAborted();
        const image = images(i) as string;
        // Pass a snapshot of the current sheet to maintain context without image bloat
        const lines = await extract(i, image, sheetFile.sheet);
        sheetFile.sheet.push(...lines);
        sheetFile.sheet.sort((a, b) => (a['رقم الصفحة'] - b['رقم الصفحة']) || (a['رقم النص'] - b['رقم النص']));
        processedPages.push(i);
        await getRedis().set(`${sessionId}/state`, JSON.stringify({ processedPages, mode }), "EX", 60 * 60 * 5);
        if (lines.length > 0) {
          await getRedis().set(`${sessionId}/sheet`, JSON.stringify(sheetFile), "EX", 60 * 60 * 5);
        }
        await getRedis().set(`${sessionId}/progress`, JSON.stringify({
          stage: "EXTRACTING",
          cursor: i,
          progress: Math.round(((processedPages.length / totalPages) * 100)),
          details: JSON.stringify(lines)
        }));
      }));

      // Final save of the full sheet and state with mode
      await getRedis().set(`${sessionId}/state`, JSON.stringify({ processedPages, mode }), "EX", 60 * 60 * 5);
      await getRedis().set(`${sessionId}/sheet`, JSON.stringify(sheetFile), "EX", 60 * 60 * 5);

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

    await updateSessionStatus(sessionId, 'completed')

    return NextResponse.json({ sheetUrl }, { status: 200 });

  } catch (error: any) {
    // Handle client abort
    if (error.name === "AbortError") {
      console.log(`[POST] Client connection aborted for sessionId: ${sessionId}`);
      await updateSessionStatus(sessionId, 'error')
      // Force final save before exiting
      await getRedis().set(`${sessionId}/state`, JSON.stringify({ processedPages, mode }), "EX", 60 * 60 * 5);
      await getRedis().set(`${sessionId}/sheet`, JSON.stringify(sheetFile), "EX", 60 * 60 * 5);
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

  // Sort by page and text number
  dataArray.sort((a, b) => (a['رقم الصفحة'] - b['رقم الصفحة']) || (a['رقم النص'] - b['رقم النص']));

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

  // Delete storage
  await getRedis().del(`${sessionId}/progress`);
  await getRedis().del(`${sessionId}/sheet`);
  await getRedis().del(`${sessionId}/state`);

  // Remove from index
  await getRedis().srem('sessions:index', sessionId);
  await getRedis().hdel('sessions:metadata', sessionId);

  return NextResponse.json({ success: true }, { status: 200 });
}