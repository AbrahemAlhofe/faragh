"use client";

import { useState } from 'react';
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
  Stack,
} from '@chakra-ui/react';
import { Toaster, toaster } from '@/components/ui/toaster';
import { FileUpload, Icon } from '@chakra-ui/react';
import { LuDownload, LuUpload } from 'react-icons/lu';
import PDFDriver, { PDFDocument } from '../lib/pdfDriver';
import Timer from '@/components/ui/timer';
import { Line } from '@/lib/types';

const scanner = new PDFDriver();

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pdf, setPdf] = useState<PDFDocument | null>(null);
  const [endPage, setEndPage] = useState(0);
  const [currentPageThumbnail, setCurrentPageThumbnail] = useState<Blob | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const pdf = await scanner.read(file);
      setFile(file);
      setPdf(pdf);
      setTotalPages(pdf.proxy.numPages);
      setEndPage(pdf.proxy.numPages);
      setIsLoading(true);
      setCurrentPageThumbnail(await (await scanner.readPage(file, 1)).scan());
      setIsLoading(false);
    }
  };

  const showPage = async (page: number) => {

    if (!file) {
      toaster.create({
        title: 'No file selected',
        type: 'error',
        duration: 3000,
      });
      return;
    }

    setCurrentPageThumbnail(await (await scanner.readPage(file, page)).scan());

  }

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

      if (!pdf) {
        throw new Error('PDF not loaded');
      }

      setIsProcessing(true);

      const formData = new FormData();
      formData.append('pdf', file);
      const { sheetUrl }: { sheetUrl: string } = await fetch(`/api/sheetify`, { method: 'POST', body: formData }).then(res => res.json());
      
      setSheetUrl(sheetUrl);

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
        duration: 3000,
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
                <Progress.Root defaultValue={0} width="md" max={100}>
                  <HStack gap="5">
                    <Progress.Label>{currentPage}/{totalPages}</Progress.Label>
                    <Progress.Track flex="1">
                      <Progress.Range />
                    </Progress.Track>
                    <Progress.ValueText>{Math.round(currentPage / totalPages * 100)}%</Progress.ValueText>
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
        <VStack gap={5} width={'20%'} height={'100%'} justifyContent={'space-between'}>
          {currentPageThumbnail == null && <FileUpload.Root
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
          {currentPageThumbnail != null && <img src={URL.createObjectURL(currentPageThumbnail)} style={{minWidth: '20vw', minHeight: '65vh', objectFit: 'contain'}} alt="current page thumbnail" width={'20vw'} height={'65vh'} />}
          <Button onClick={handleConvert} loading={isLoading} variant="surface" width={'100%'}>
            فرغ النص
          </Button>
          { totalPages > 0 &&
            <HStack dir="rtl" gap={5} width={'20vw'} justifyContent={'space-between'}>
                <Field.Root>
                  <Field.Label>
                    الصفحة الحالية
                  </Field.Label>
                  <Input type="number" min="1" max={totalPages} value={currentPage} onChange={(e) => (setCurrentPage(Number(e.target.value)), showPage(Number(e.target.value)))} />
                </Field.Root>
                <Field.Root>
                  <Field.Label>
                    صفحة النهاية
                  </Field.Label>
                  <Input type="number" min="1" max={totalPages} value={endPage} onChange={(e) => setEndPage(Number(e.target.value))} />
                </Field.Root>
              </HStack>
          }
        </VStack>
      </HStack>
    </Container>
  );
}
