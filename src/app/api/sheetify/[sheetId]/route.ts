import { SheetFile } from "@/lib/types";
import { convertToCSV } from "@/lib/utils";
import Redis from "ioredis";
import { NextRequest } from "next/server";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export async function GET(req: NextRequest, { params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;

  if (!sheetId) {
    return new Response(JSON.stringify({ error: "No sheetId provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sheetFileContent = await redis.get(sheetId);

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

  // Convert JSON to CSV
  const csv = convertToCSV(dataArray);
  const filename = `${pdfFilename.replace('.pdf', '')}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}