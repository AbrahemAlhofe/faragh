import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import "@ungap/with-resolvers";
import Redis from "ioredis";
import { ForeignNameRow, LineRow, SESSION_MODES, SESSION_STAGES, SessionProgress, SheetFile } from "@/lib/types";
import { useForeignNamesExtractor, useScanner, useSheeter } from "@/lib/serverHooks";
import { convertToCSV, parallelReading } from "@/lib/utils";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {

  const { sessionId } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File;
  let sheetFile: SheetFile<ForeignNameRow> | SheetFile<LineRow> = { pdfFilename: file.name, sheet: [] };

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  try {

    const startPage = parseInt(
      req.nextUrl.searchParams.get("startPage") || "1",
      10
    );
    const endPage = parseInt(req.nextUrl.searchParams.get("endPage") || "1", 10);
    const mode: SESSION_MODES = req.nextUrl.searchParams.get("mode") as SESSION_MODES || SESSION_MODES.NAMES;
    const totalPages = endPage - startPage + 1;
    const contentType = req.headers.get("content-type") || "";
    const sessionProgress: SessionProgress<{}> = { stage: SESSION_STAGES.IDLE, cursor: 1, progress: 0, details: [] }

    await redis.set(
      `${sessionId}/progress`,
      JSON.stringify(sessionProgress)
    );

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Unsupported Media Type" },
        { status: 415 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const document = await getDocument({ data: uint8Array }).promise;
  
    const canvasFactory = document.canvasFactory;
    const [images, scan] = useScanner(canvasFactory, 1);
    const scannedPages = [];
    await parallelReading(document.numPages, async (pageNum: number) => {
      if ( pageNum < startPage || pageNum > endPage ) return;
      const page = await document.getPage(pageNum);
      await scan(pageNum, page);
      scannedPages.push(pageNum);
      await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "SCANNING", cursor: pageNum, progress: Math.floor((scannedPages.length / totalPages) * 100), details: "" }));
    });

    if (mode === SESSION_MODES.NAMES) {

      const extractedPages = [];
      const [_sheet, extract] = await useForeignNamesExtractor({ readingMemoryLimit: 1 });
      sheetFile =  { pdfFilename: file.name, sheet: _sheet };
      await parallelReading(document.numPages, async (pageNumber: number) => {
        const image = images(pageNumber) as string;
        const lines = await extract(pageNumber, image);
        extractedPages.push(pageNumber);
        await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "EXTRACTING", cursor: pageNumber, progress: Math.floor((extractedPages.length / totalPages) * 100), details: JSON.stringify(lines) }));
      });

    }

    if (mode === SESSION_MODES.LINES) {
    
      const [_sheet, extract] = await useSheeter({ readingMemoryLimit: 15 });
      sheetFile =  { pdfFilename: file.name, sheet: _sheet };
      for (let i = startPage; i <= endPage; i++) {
        const image = images(i) as string;
        const lines = await extract(i, image);
        await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "EXTRACTING", cursor: i, progress: Math.floor((i / document.numPages) * 100), details: JSON.stringify(lines) }));
      }
    
    }

    await redis.set(
      `${sessionId}/sheet`,
      JSON.stringify(sheetFile),
      "EX",
      60 * 60 * 5
    );
    const sheetUrl = new URL(`/api/sessions/${sessionId}`, req.url).toString();
  
    return NextResponse.json({ sheetUrl }, { status: 200 });

  } catch (error: unknown) {

    await redis.set(
      `${sessionId}/sheet`,
      JSON.stringify(sheetFile),
      "EX",
      60 * 60 * 5
    );
    const sheetUrl = new URL(`/api/sessions/${sessionId}`, req.url).toString();

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

  const sheetFileContent = await redis.get(`${sessionId}/sheet`);

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

  let csv = convertToCSV(dataArray);
  csv = "\uFEFF" + csv;

  const filename = `${pdfFilename.replace(".pdf", "")}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        filename
      )}"`,
    },
  });
}
