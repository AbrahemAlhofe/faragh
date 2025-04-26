import type { NextConfig } from "next";
import path from 'node:path';
import fs from 'node:fs';

const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
const pdfWorkerPath = path.join(pdfjsDistPath, 'build', 'pdf.worker.mjs');

fs.cpSync(pdfWorkerPath, './public/pdfjs-dist/build/pdf.worker.mjs', { recursive: true });

const nextConfig: NextConfig = {};

export default nextConfig;