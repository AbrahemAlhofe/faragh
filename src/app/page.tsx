"use client";

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Container,
  VStack,
  Flex,
  Table,
  HStack,
  Progress,
  Input,
  Field,
} from '@chakra-ui/react';
import { Toaster, toaster } from '@/components/ui/toaster';
import { FileUpload, Icon } from '@chakra-ui/react';
import { LuDownload, LuUpload } from 'react-icons/lu';
import Timer from '@/components/ui/timer';
import { Line, PDFJs } from '@/lib/types';
import PDFViewer from '@/components/ui/pdf-viewer';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [startPage, setStartPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [endPage, setEndPage] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [cursor, setCursor] = useState(1);
  let pdfJs: PDFJs | null = null;

  useEffect(() => {
    
    (async () => {

      pdfJs = await import('pdfjs-dist');
  
      pdfJs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).toString();
  
    })()

  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (pdfJs) {
        const pdf = await pdfJs.getDocument({ data: await file.arrayBuffer() }).promise;
        setTotalPages(pdf.numPages);
        setEndPage(pdf.numPages);
        pdf.destroy();
      }
      setFile(file);
      setIsLoading(true);
      setTimeout(() => setIsLoading(false), 1000)
    }
  };

  const handleConvert = async () => {
    if (!file) {
      toaster.create({
        title: 'No file selected',
        type: 'error',
        duration: 3000,
      });
      return;
    }

    setIsLoading(true);
    try {

      if (!file) {
        throw new Error('PDF not loaded');
      }

      setIsProcessing(true);

      const formData = new FormData();
      formData.append('pdf', file);
      const request = await fetch(`/api/sheetify?startPage=${startPage}&endPage=${endPage}`, { method: 'POST', body: formData });
      const response = await request.json();

      if (request.ok) {
        
        setSheetUrl(response.sheetUrl);

      } else {

        const { type } = response;

        if (type === 'EXCEEDED_QUOTA') {
          toaster.create({
            title: 'الحد اليومي للتفريغ قد تم تجاوزه',
            description: 'الحد اليومي للتفريغ هو 500 صفحة في اليوم',
            type: 'error',
            duration: 3000
          });
        }

      }      

      // let _currentPage = currentPage;

      // for await (const page of pdf.range(currentPage, endPage)) {
      //   const formData = new FormData();
      //   const image = await page.scan();
      //   setCurrentPageThumbnail(image);
      //   formData.append('image', image);
      //   const response = await fetch(`/api/sheetify?pageNumber=${_currentPage}`, { method: 'POST', body: formData });
      //   const data: { result: Line[] } = await response.json();
      //   setLines((lines) => [...lines, ...data.result]);
      //   setCurrentPage((currentPage) => currentPage + 1);
      //   _currentPage += 1;
      // }

      setIsDone(true);

    } catch (error: unknown) {
      if (error instanceof Error) {
        toaster.create({
          title: 'Conversion failed',
          description: error.message,
          type: 'error',
          duration: 3000,
        });
      }
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!sheetUrl) {
      toaster.create({
        title: 'No sheet URL available',
        type: 'error',
        duration: 3000
      });
      return;
    }
    
    const link = document.createElement('a');
    link.href = sheetUrl;
    link.download = file?.name.replace('.pdf', '.csv') || 'sheet.csv';
    link.click();
  };

  return (
    <Container fluid py={10} height={'100vh'} width={'100vw'} centerContent={true}>
      <Toaster />
      <HStack height={'100%'} width={'100%'} gap={5} alignItems={'stretch'}>
      <VStack gap={5} width={'20%'} height={'100%'} justifyContent={'space-between'}>
          {file == null && <FileUpload.Root
            accept={["application/pdf"]}
            alignItems="stretch"
            flexGrow={1}
            maxFiles={10}
            onChange={handleFileChange}
            width={'20vw'}
            height={'65vh'}
          >
            <FileUpload.HiddenInput />
            <FileUpload.Dropzone flexGrow={1}>
              <Icon size="md" color="fg.muted">
                <LuUpload />
              </Icon>
              <FileUpload.DropzoneContent>
                <Box>Drag and drop files here</Box>
                <Box color="fg.muted">
                  <b>.pdf</b> up to 5MB
                </Box>
              </FileUpload.DropzoneContent>
            </FileUpload.Dropzone>
          </FileUpload.Root> }
          {file != null && <PDFViewer file={file} cursor={cursor}></PDFViewer>}
          { file != null && <Button onClick={handleConvert} loading={isLoading} variant="surface" width={'100%'}>
            فرغ النص
          </Button> }
          { totalPages > 0 &&
            <HStack dir="rtl" gap={5} width={'20vw'} justifyContent={'space-between'}>
                <Field.Root>
                  <Field.Label>
                    صفحة البداية
                  </Field.Label>
                  <Input type="number" min="1" max={totalPages} value={startPage} onFocus={(e) => setCursor(Number(e.target.value))} onChange={(e) => (setStartPage(Number(e.target.value)), setCursor(Number(e.target.value)))} />
                </Field.Root>
                <Field.Root>
                  <Field.Label>
                    صفحة النهاية
                  </Field.Label>
                  <Input type="number" min="1" max={totalPages} value={endPage} onFocus={(e) => setCursor(Number(e.target.value))} onChange={(e) => (setEndPage(Number(e.target.value)), setCursor(Number(e.target.value)))} />
                </Field.Root>
              </HStack>
          }
        </VStack>
        <VStack gap={5} width={'80%'}> 
          <Table.ScrollArea height={'100%'} width={'100%'} p={0}>
            <Table.Root striped dir="rtl" stickyHeader>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>رقم الصفحة</Table.ColumnHeader>
                  <Table.ColumnHeader>رقم النص</Table.ColumnHeader>
                  <Table.ColumnHeader>الشخصية</Table.ColumnHeader>
                  <Table.ColumnHeader>النص</Table.ColumnHeader>
                  <Table.ColumnHeader>النبرة</Table.ColumnHeader>
                  <Table.ColumnHeader>المكان</Table.ColumnHeader>
                  <Table.ColumnHeader>الخلفية الصوتية</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {lines.map((line, index) => (
                  <Table.Row key={index}>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{line['رقم الصفحة']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{line['رقم النص']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{line['الشخصية']}</Table.Cell>
                    <Table.Cell minWidth={"20vw"} whiteSpace={"wrap"}>{line['النص']}</Table.Cell>
                    <Table.Cell minWidth={"20vw"} whiteSpace={"wrap"}>{line['النبرة']}</Table.Cell>
                    <Table.Cell minWidth={"20vw"} whiteSpace={"wrap"}>{line['المكان']}</Table.Cell>
                    <Table.Cell minWidth={"20vw"} whiteSpace={"wrap"}>{line['الخلفية الصوتية']}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root> 
          </Table.ScrollArea>
          { totalPages > 0 && 
            <HStack gap={5} width={'100%'} height={'3em'} justifyContent={'space-between'}>
              <Flex>
                <Progress.Root width="md" max={100} value={startPage / totalPages * 100}>
                  <HStack gap="5">
                    <Progress.Label>{startPage}/{totalPages}</Progress.Label>
                    <Progress.Track flex="1">
                      <Progress.Range />
                    </Progress.Track>
                    <Progress.ValueText>{Math.round(startPage / totalPages * 100)}%</Progress.ValueText>
                  </HStack>
                </Progress.Root>
              </Flex>
              <HStack dir="rtl" gap={5}>
                { isDone && <Button variant="surface" onClick={handleDownload}>
                  <span>تنزيل الجدول</span>
                  <Icon size="md" color="fg.muted">
                    <LuDownload />
                  </Icon>
                </Button> }
                <Timer running={isProcessing}></Timer>
              </HStack>
            </HStack>
          }
        </VStack>
      </HStack>
    </Container>
  );
}
