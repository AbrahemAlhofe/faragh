import PDFDriver from "@/lib/pdfDriver";
import { Container, Spinner } from "@chakra-ui/react";
import { useEffect, useState } from "react";

const scanner = new PDFDriver();

export default function PDFViewer({ file, cursor = 0 }: { file: File, cursor: number }) {
    const [thumbnail, setThumbnail] = useState<string | null>(null);

    useEffect(() => {
        setThumbnail(null);
        (async () => {
            const base64 = await (await scanner.readPage(file, cursor)).scan();
            const url = URL.createObjectURL(base64);
            setThumbnail(url);
        })()
    }, [cursor]);

    return (
        <Container width={'20vw'} height={'65vh'} style={{display: "flex", justifyContent: "center", alignItems: "center"}}>
            {thumbnail == null && <Spinner /> }
            {thumbnail != null && <img src={thumbnail} style={{minWidth: '20vw', minHeight: '65vh', objectFit: 'contain'}} alt="current page thumbnail" width={'20vw'} height={'65vh'} />}
        </Container>
    );
}