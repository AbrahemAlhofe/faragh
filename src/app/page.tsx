"use client";
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Container,
  VStack,
  HStack,
  Progress,
  Input,
  Field,
  Spinner,
  Table,
  RadioCard
} from '@chakra-ui/react';
import { Toaster, toaster } from '@/components/ui/toaster';
import { FileUpload, Icon } from '@chakra-ui/react';
import { LuDownload, LuUpload } from 'react-icons/lu';
import Timer from '@/components/ui/timer';
import { ForeignNameRow, LineRow, PDFJs, SESSION_MODES, SESSION_STAGES } from '@/lib/types';
import PDFViewer from '@/components/ui/pdf-viewer';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [startPage, setStartPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [endPage, setEndPage] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [pdfViewerCursor, setPdfViewerCursor] = useState(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentProgress, setProgress] = useState<number>(0); 
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [progressDetails, setProgressDetails] = useState<LineRow[] | ForeignNameRow[] | null>(null);
  const [selectedMode, setSelectedMode] = useState<SESSION_MODES | null>(SESSION_MODES.NAMES);
  const [pdfJs, setPdfJs] = useState<PDFJs | null>(null);

  const modes = [
    { value: SESSION_MODES.NAMES, title: "الأسماء" },
    { value: SESSION_MODES.LINES, title: "الجمل" }
  ]

  useEffect(() => {

    (async () => {

      console.log("Try loading PDFJs")

      const loadedPdfJs = await import('pdfjs-dist');

      loadedPdfJs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).toString();

      setPdfJs(loadedPdfJs);

    })()

  }, []);

  useEffect(() => {
    if (!sessionId) return;

    let active = true;

    const poll = async () => {
      if (!active) return;

      if (!isProcessing) return;

      try {
        const request = await fetch(`/api/sessions/${sessionId}/progress`);
        const { stage, cursor, progress, details } = await request.json();

        if (stage === SESSION_STAGES.READY) {
          setProgressLabel(null);
          setProgress(0);
          setProgressDetails(null);
        } else {
          setPdfViewerCursor(cursor);
          setProgress(progress);
        }

        if (stage === SESSION_STAGES.SCANNING) {
          setProgressLabel("جاري مسح ملف الـ PDF");
        }

        if (stage === SESSION_STAGES.EXTRACTING) {
          setProgressLabel("جاري إستخراج النص");
          setProgressDetails(JSON.parse(details));
        }

        if (isDone) {
          setIsDone(true);
        }

      } catch (error) {
        console.error("Polling error:", error);
      }

      setTimeout(poll, 1000); // Schedule next poll
    };

    poll();

    return () => {
      active = false; // Cleanup: stop polling on unmount or sessionId change
    };

  }, [sessionId, isUploading, isProcessing]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && pdfJs) {
      try {
        setIsUploading(true);
        const { sessionId } = await fetch(`/api/sessions`, { method: "POST" }).then(res => res.json());
        const pdf = await pdfJs.getDocument({ data: await file.arrayBuffer() }).promise;
        setSessionId(sessionId);
        setTotalPages(pdf.numPages);
        setEndPage(pdf.numPages);
        pdf.destroy();
        setFile(file);
        document.title = `فراغ استوديو | ${file.name.replace(".pdf", "")}`
        setIsUploading(false);
      } catch (error) {
        if (error instanceof Error) {
          toaster.create({
            title: 'خطأ في إنشاء الجلسة',
            description: error.message,
            type: 'error',
            duration: 3000,
          });
        }
      }
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

    setIsUploading(true);
    try {

      if (!file) {
        throw new Error('PDF not loaded');
      }

      setIsProcessing(true);

      const formData = new FormData();
      formData.append('file', file);
      const request = await fetch(`/api/sessions/${sessionId}?startPage=${startPage}&endPage=${endPage}&mode=${selectedMode}`, { method: 'POST', body: formData });
      const response = await request.json();

      if (request.ok) {
        
        setSheetUrl(response.sheetUrl);

        setIsDone(true);

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

    } catch (error: unknown) {
      if (error instanceof Error) {
        toaster.create({
          title: 'حدث خطأ أثناء إستخراج النص',
          description: error.message,
          type: 'error',
          duration: 3000,
        });
      }
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
      setProgressLabel(null)
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
      <HStack height={'100%'} width={'100%'} gap={10} alignItems={'stretch'}>
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
              {isUploading && <Spinner />}
              {!isUploading && <>
                <Icon size="md" color="fg.muted">
                  <LuUpload />
                </Icon>
                <FileUpload.DropzoneContent>
                  <Box>Drag and drop pdf here</Box>
                </FileUpload.DropzoneContent>
              </>}
            </FileUpload.Dropzone>
          </FileUpload.Root> }
          {file != null && <PDFViewer file={file} cursor={pdfViewerCursor}></PDFViewer>}
          { file != null && <Button onClick={handleConvert} loading={isUploading} variant="surface" width={'100%'}>
            فرغ النص
          </Button> }
          { totalPages > 0 &&
            <HStack dir="rtl" gap={5} width={'20vw'} justifyContent={'space-between'}>
                <Field.Root>
                  <Field.Label>
                    صفحة البداية
                  </Field.Label>
                  <Input type="number" min="1" max={totalPages} value={startPage} disabled={isProcessing} onFocus={(e) => setPdfViewerCursor(Number(e.target.value))} onChange={(e) => (setStartPage(Number(e.target.value)), setPdfViewerCursor(Number(e.target.value)))} />
                </Field.Root>
                <Field.Root>
                  <Field.Label>
                    صفحة النهاية
                  </Field.Label>
                  <Input type="number" min="1" max={totalPages} value={endPage} disabled={isProcessing} onBlur={e => setPdfViewerCursor(Number(startPage))} onFocus={(e) => setPdfViewerCursor(Number(e.target.value))} onChange={(e) => (setEndPage(Number(e.target.value)), setPdfViewerCursor(Number(e.target.value)))} />
                </Field.Root>
              </HStack>
          }
            <RadioCard.Root value={selectedMode} width="100%">
              <HStack align="stretch">
                {modes.map((mode) => (
                  <RadioCard.Item key={mode.value} value={mode.value} flex="1" cursor={"pointer"}>
                    <RadioCard.ItemHiddenInput />
                    <RadioCard.ItemControl onClick={() => setSelectedMode(mode.value)}>
                      <RadioCard.ItemText textAlign={"center"}>{mode.title}</RadioCard.ItemText>
                    </RadioCard.ItemControl>
                  </RadioCard.Item>
                ))}
              </HStack>
            </RadioCard.Root>
        </VStack>
        <VStack gap={5} width={'80%'}> 
          <Box height={'100%'} width={'100%'} p={10} border={"2px dashed"} borderColor={"gray.800"} borderRadius={5}>
          { progressDetails !== null && <Table.ScrollArea height={'100%'} width={'100%'} p={0}>
            <Table.Root striped dir="rtl" stickyHeader>
              { selectedMode === SESSION_MODES.NAMES && <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>رقم الصفحة</Table.ColumnHeader>
                  <Table.ColumnHeader>رقم النص</Table.ColumnHeader>
                  <Table.ColumnHeader>الإسم بالعربي</Table.ColumnHeader>
                  <Table.ColumnHeader>الإسم باللغة الأجنبية</Table.ColumnHeader>
                  <Table.ColumnHeader>الرابط الأول</Table.ColumnHeader>
                  <Table.ColumnHeader>الرابط الثاني</Table.ColumnHeader>
                  <Table.ColumnHeader>الرابط الثالث</Table.ColumnHeader>
                </Table.Row>
              </Table.Header> }
              { selectedMode === SESSION_MODES.LINES && <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>رقم الصفحة</Table.ColumnHeader>
                  <Table.ColumnHeader>رقم النص</Table.ColumnHeader>
                  <Table.ColumnHeader>الشخصية</Table.ColumnHeader>
                  <Table.ColumnHeader>النص</Table.ColumnHeader>
                  <Table.ColumnHeader>النبرة</Table.ColumnHeader>
                  <Table.ColumnHeader>المكان</Table.ColumnHeader>
                  <Table.ColumnHeader>الخلفية الصوتية</Table.ColumnHeader>
                </Table.Row>
              </Table.Header> }
              {selectedMode === SESSION_MODES.NAMES && <Table.Body>
                {(progressDetails as ForeignNameRow[]).map((row, index) => (
                  <Table.Row key={index}>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['رقم الصفحة']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['رقم النص']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['الإسم بالعربي']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['الإسم باللغة الأجنبية']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['الرابط الأول']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['الرابط الثاني']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['الرابط الثالث']}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>}
              {selectedMode === SESSION_MODES.LINES && <Table.Body>
                {(progressDetails as LineRow[]).map((row: LineRow, index) => (
                  <Table.Row key={index}>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['رقم الصفحة']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['رقم النص']}</Table.Cell>
                    <Table.Cell minWidth={"2vw"} whiteSpace={"wrap"}>{row['الشخصية']}</Table.Cell>
                    <Table.Cell minWidth={"20vw"} whiteSpace={"wrap"}>{row['النص']}</Table.Cell>
                    <Table.Cell minWidth={"10vw"} whiteSpace={"wrap"}>{row['النبرة']}</Table.Cell>
                    <Table.Cell minWidth={"5vw"} whiteSpace={"wrap"}>{row['المكان']}</Table.Cell>
                    <Table.Cell minWidth={"7vw"} whiteSpace={"wrap"}>{row['الخلفية الصوتية']}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>}
            </Table.Root> 
          </Table.ScrollArea> }
          </Box>
          { totalPages > 0 && 
            <HStack gap={5} width={'100%'} height={'3em'} justifyContent={'space-between'}>
              <VStack alignItems={'flex-start'} >
                <Progress.Root width="md" max={100} value={currentProgress}>
                  <HStack gap="5">
                    <Progress.Track flex="1">
                      <Progress.Range />
                    </Progress.Track>
                    <Progress.ValueText>{currentProgress}%</Progress.ValueText>
                  </HStack>
                </Progress.Root>
                <HStack fontSize={'sm'} color="gray.500">
                  {progressLabel && <Spinner size={'sm'}/>}
                  {progressLabel}
                </HStack>
              </VStack>
              <HStack dir="rtl" gap={5}>
                <Button variant="surface" onClick={handleDownload}>
                  <span>تنزيل الجدول</span>
                  <Icon size="md" color="fg.muted">
                    <LuDownload />
                  </Icon>
                </Button>
                <Timer running={isProcessing}></Timer>
              </HStack>
            </HStack>
          }
        </VStack>
      </HStack>
    </Container>
  );
}