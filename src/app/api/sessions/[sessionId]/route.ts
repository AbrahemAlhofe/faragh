import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import countPages from "page-count";
import { ForeignNameRow, LineRow, SESSION_MODES, SESSION_STAGES, SessionProgress, SheetFile } from "@/lib/types";
import { useForeignNamesExtractor, useScanner, useSheeter } from "@/lib/serverHooks";
import { convertToXLSX, parallelReading } from "@/lib/utils";

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

    const [images, numberOfPages, scan] = await useScanner(file);
    const scannedPages = [];
    await parallelReading(numberOfPages, async (pageNum: number) => {
      if ( pageNum < startPage || pageNum > endPage ) return;
      await scan(pageNum);
      scannedPages.push(pageNum);
      await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "SCANNING", cursor: pageNum, progress: Math.floor((scannedPages.length / totalPages) * 100), details: "" }));
    });

    if (mode === SESSION_MODES.NAMES) {

      const [_sheet, extract] = await useForeignNamesExtractor({ readingMemoryLimit: 100 });
      sheetFile = { pdfFilename: file.name, sheet: _sheet };
      for (let i = startPage; i <= endPage; i++) {
        const image = images(i) as string;
        const lines = await extract(i, image);
        await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "EXTRACTING", cursor: i, progress: Math.floor((i / numberOfPages) * 100), details: JSON.stringify(lines) }));
      }
    
    }

    if (mode === SESSION_MODES.LINES) {
    
      const [_sheet, extract] = await useSheeter({ readingMemoryLimit: 15 });
      sheetFile =  { pdfFilename: file.name, sheet: _sheet };
      for (let i = startPage; i <= endPage; i++) {
        const image = images(i) as string;
        const lines = await extract(i, image);
        await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "EXTRACTING", cursor: i, progress: Math.floor((i / numberOfPages) * 100), details: JSON.stringify(lines) }));
      }
    
    }

    await redis.set(
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

  } catch (error: unknown) {

    await redis.set(
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

  const xlsxBuffer = convertToXLSX(dataArray);

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
