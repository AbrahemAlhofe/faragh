import { base64ToBlob } from "@/lib/utils";
import { Container, Spinner } from "@chakra-ui/react";
import { useEffect, useState } from "react";

export default function PDFViewer({ file, cursor = 1 }: { file: File, cursor: number }) {

    const [pdfDocument, setPdfDocument] = useState<any | null>(null);

    useEffect(() => {
        let isMounted = true;
        let localPdfDoc: any;
    
        (async () => {
            const pdfJs = await import('pdfjs-dist');
    
            pdfJs.GlobalWorkerOptions.workerSrc = new URL(
                'pdfjs-dist/build/pdf.worker.mjs',
                import.meta.url
            ).toString();
    
            localPdfDoc = await pdfJs.getDocument({ data: await file.arrayBuffer() }).promise;
    
            if (isMounted) {
                setPdfDocument(localPdfDoc);
            } else {
                localPdfDoc?.destroy();
            }
        })();
    
        return () => {
            isMounted = false;
            localPdfDoc?.destroy();
        };
    }, [file]);

    const [thumbnail, setThumbnail] = useState<string | null>(null);

    useEffect(() => {
        setThumbnail(null);
        (async () => {

            if (pdfDocument == null) return;
            const page = await pdfDocument.getPage(cursor);
            const viewport = page.getViewport({ scale: 0.9 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
        
            canvas.width = viewport.width;
            canvas.height = viewport.height;
        
            const renderContext = {
                canvasContext: context!,
                viewport: viewport,
            };
        
            await page.render(renderContext).promise;
            const imageData = canvas.toDataURL('image/png');
            const blob = base64ToBlob(imageData, 'image/png');
            const url = URL.createObjectURL(blob);
            setThumbnail(url);
        })()
    }, [pdfDocument, cursor]);

    return (
        <Container width={'20vw'} height={'65vh'} style={{display: "flex", justifyContent: "center", alignItems: "center"}}>
            {thumbnail == null && <Spinner /> }
            {thumbnail != null && <img src={thumbnail} style={{minWidth: '20vw', minHeight: '65vh', objectFit: 'contain'}} alt="current page thumbnail" width={'20vw'} height={'65vh'}/>}
        </Container>
    );
}