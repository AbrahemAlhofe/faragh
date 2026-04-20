import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json({ error: "No sessionId provided" }, { status: 400 });
  }

  const pdfPath = path.join(process.cwd(), "storage", "pdfs", `${sessionId}.pdf`);

  try {
    const fileBuffer = await fs.readFile(pdfPath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${sessionId}.pdf"`
      }
    });
  } catch (error) {
    console.error("Error reading PDF:", error);
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }
}
