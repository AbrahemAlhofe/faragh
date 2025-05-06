import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import "@ungap/with-resolvers";
import Redis from "ioredis";
import { Line, SheetFile } from "@/lib/types";
import { useScanner, useSheeter } from "@/lib/serverHooks";
import { convertToCSV, parallelReading } from "@/lib/utils";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const startPage = parseInt(
    req.nextUrl.searchParams.get("startPage") || "1",
    10
  );
  const endPage = parseInt(req.nextUrl.searchParams.get("endPage") || "1", 10);
  const sheetId = Math.random().toString(36).substring(2, 15);
  const contentType = req.headers.get("content-type") || "";

  await redis.set(
    `${sessionId}/progress`,
    JSON.stringify({ stage: "IDLE", cursor: 0 })
  );

  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Unsupported Media Type" },
      { status: 415 }
    );
  }

  const formData = await req.formData();
  const pdf = formData.get("pdf") as File;

  if (!pdf) {
    return NextResponse.json({ error: "No pdf uploaded" }, { status: 400 });
  }

  const arrayBuffer = await pdf.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const document = await getDocument({ data: uint8Array }).promise;

  const canvasFactory = document.canvasFactory;
  const [images, scan] = useScanner(canvasFactory);
  let scannedPages = [];
  await parallelReading(document.numPages, async (pageNum: number) => {
    await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "SCANNING", cursor: pageNum, progress: Math.floor((scannedPages.length / document.numPages) * 100), details: "" }));
    const page = await document.getPage(pageNum);
    await scan(pageNum, page);
    scannedPages.push(pageNum);
  });

  const [sheet, extract] = await useSheeter();
  for (let i = startPage; i <= endPage; i++) {
    const image = images(i) as Buffer;
    const lines = await extract(i, image);
    await redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "EXTRACTING", cursor: i, progress: Math.floor((i / document.numPages) * 100), details: JSON.stringify(lines) }));
  }

  const sheetFile: SheetFile = { pdfFilename: pdf.name, sheet };
  await redis.set(
    `${sheetId}/results`,
    JSON.stringify(sheetFile),
    "EX",
    60 * 60 * 24
  );
  const sheetUrl = new URL(`/api/sheetify/${sheetId}`, req.url).toString();

  return NextResponse.json({ sheetUrl }, { status: 200 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sheetId: string }> }
) {
  const { sheetId } = await params;

  if (!sheetId) {
    return new Response(JSON.stringify({ error: "No sheetId provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sheetFileContent = await redis.get(`${sheetId}/results`);

  if (!sheetFileContent) {
    return new Response(JSON.stringify({ error: "Sheet not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sheetFile: SheetFile;
  try {
    sheetFile = JSON.parse(sheetFileContent) as SheetFile;
  } catch (error) {
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

  const filename = `${pdfFilename.replace(".csv", "")}.csv`;

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
