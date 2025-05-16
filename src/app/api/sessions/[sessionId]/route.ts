import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import "@ungap/with-resolvers";
import Redis from "ioredis";
import { SESSION_STAGES, SessionProgress, SheetFile } from "@/lib/types";
import { useScanner, useSheeter } from "@/lib/serverHooks";
import { convertToCSV, parallelReading } from "@/lib/utils";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {

    const { sessionId } = await params;
    const startPage = parseInt(
      req.nextUrl.searchParams.get("startPage") || "1",
      10
    );
    const endPage = parseInt(req.nextUrl.searchParams.get("endPage") || "1", 10);
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

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
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
      await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "SCANNING", cursor: pageNum, progress: Math.floor((scannedPages.length / document.numPages) * 100), details: "" }));
    });
  
    const [sheet, extract] = await useSheeter({ readingMemoryLimit: 15 });
    for (let i = startPage; i <= endPage; i++) {
      const image = images(i) as string;
      const lines = await extract(i, image);
      await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "EXTRACTING", cursor: i, progress: Math.floor((i / document.numPages) * 100), details: JSON.stringify(lines) }));
    }
  
    const sheetFile: SheetFile = { pdfFilename: file.name, sheet };
    await redis.set(
      `${sessionId}/sheet`,
      JSON.stringify(sheetFile),
      "EX",
      60 * 60 * 5
    );
    const sheetUrl = new URL(`/api/sessions/${sessionId}`, req.url).toString();
  
    return NextResponse.json({ sheetUrl }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: "An error occurred", details: error.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: "An error occurred", details: error }, { status: 500 });
    }
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

  let sheetFile: SheetFile;
  try {
    sheetFile = JSON.parse(sheetFileContent) as SheetFile;
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
