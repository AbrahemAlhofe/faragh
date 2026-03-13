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
  Text,
  RadioCard,
  Badge
} from '@chakra-ui/react';
import { Toaster, toaster } from '@/components/ui/toaster';
import { FileUpload, Icon } from '@chakra-ui/react';
import { LuDownload, LuUpload } from 'react-icons/lu';
import Timer from '@/components/ui/timer';
import { ForeignNameRow, LineRow, PDFJs, SESSION_MODES, SESSION_STAGES } from '@/lib/types';
import { filterSimilarEnglishNames } from '@/lib/utils';
import PDFViewer from '@/components/ui/pdf-viewer';
import nextJsVersion from 'next/package.json';
import Script from 'next/script';

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
    console.info("PDF.js loaded:", pdfJs?.version);
    console.info("Next.js version:", nextJsVersion.version);
  }, [pdfJs]);
  console.info("Build time:", process.env.buildTime);

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
          const parsedDetails = JSON.parse(details);
          // Apply filter for duplicate English names if in NAMES mode
          const filteredDetails = selectedMode === SESSION_MODES.NAMES 
            ? filterSimilarEnglishNames(parsedDetails)
            : parsedDetails;
          setProgressDetails(filteredDetails);
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
      setIsProcessing(true);

      const formData = new FormData();
      formData.append('file', file);
      
      const request = await fetch(
        `/api/sessions/${sessionId}?startPage=${startPage}&endPage=${endPage}&mode=${selectedMode}`,
        { 
          method: 'POST',
          body: formData
        }
      );

      // Try to parse response
      let response;
      try {
        response = await request.json();
      } catch {
        toaster.create({
          title: 'استجابة غير صحيحة',
          description: 'الخادم أرسل بيانات غير صحيحة',
          type: 'error',
          duration: 5000
        });
        return;
      }

      // Check if request was successful
      if (request.ok) {
        setSheetUrl(response.sheetUrl);
        setIsDone(true);
        toaster.create({
          title: 'تم تفريغ الكتاب بنجاح',
          type: 'success',
          duration: 3000
        });
      } else {
        // Check for server errors (5xx)
        if (request.status >= 500) {
          toaster.create({
            title: 'خطأ في الخادم',
            description: 'تأكد من اتصالك بالانترنت أو اعد المحاولة لاحقا',
            type: 'error',
            duration: 5000
          });
          return;
        }

        // Check for specific error types
        const { type } = response;

        if (type === 'EXCEEDED_QUOTA') {
          toaster.create({
            title: 'الحد اليومي للتفريغ قد تم تجاوزه',
            description: 'الحد اليومي للتفريغ هو 500 صفحة في اليوم',
            type: 'error',
            duration: 3000
          });
        } else if (type === 'GEMINI_INVALID_INPUT') {
          toaster.create({
            title: 'لا يمكن معالجة هذا الكتاب',
            description: 'استخدم هذا الموقع لحل المشكلة: https://www.ilovepdf.com/repair-pdf',
            type: 'error',
            duration: 20000
          });
        } else {
          toaster.create({
            title: 'خطأ أثناء التفريغ',
            description: response.details || 'حدث خطأ غير متوقع',
            type: 'error',
            duration: 5000
          });
        }
      }

    } catch (error: unknown) {
      if (error instanceof Error) {
        // Network error
        if (error.message.includes('fetch') || error.message.includes('Network')) {
          toaster.create({
            title: 'فقدان الاتصال',
            description: 'تحقق من اتصالك بالإنترنت',
            type: 'error',
            duration: 5000
          });
        }
        // Other errors
        else {
          toaster.create({
            title: 'حدث خطأ',
            description: error.message,
            type: 'error',
            duration: 3000
          });
        }
      }
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
      setProgressLabel(null);
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
    link.download = file?.name.replace('.pdf', '.xlsx') || 'sheet.xlsx';
    link.click();

    toaster.create({
      title: 'تم بدء التنزيل',
      description: 'متصفحك لا يدعم نافذة الحفظ المباشرة، فتم استخدام التنزيل العادي',
      type: 'info',
      duration: 4000,
    });
  };


  const handleReset = async () => {

    if(sessionId) {
      await fetch(`/api/sessions/${sessionId}`, {method: 'DELETE'})
      console.log('Start a new session')
    }

    setFile(null);
    setSessionId(null);
    setIsProcessing(false);
    setIsUploading(false);
    setIsDone(false);
    setSheetUrl(null);
    setProgress(0);
    setProgressLabel(null);
    setProgressDetails(null);
    setTotalPages(0);
    setStartPage(1);
    setEndPage(0);
    setPdfViewerCursor(1);
    
};

  return (
    <Container fluid py={10} height={'100vh'} width={'100vw'} centerContent={true}>
      <Script
        src="/pdfjs-5.4.530-dist/build/pdf.mjs"
        type="module"
        async
        onLoad={() => {
          const pdfjs = (window as any).pdfjsLib;
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs-5.4.530-dist/build/pdf.worker.mjs";
          setPdfJs(pdfjs);
        }}
      />
      <Toaster />
      <VStack width={'100%'} height={'100%'} gap={10} alignItems={'stretch'}>
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
                {isUploading && <VStack>
                  <Spinner></Spinner>
                  <Text>جاري رفع الكتاب ...</Text>
                  </VStack>}
                {!isUploading && <>
                  <Icon size="md" color="fg.muted">
                    <LuUpload />
                  </Icon>
                  <FileUpload.DropzoneContent>
                    <Box>قم برفع الملف هنا</Box>
                  </FileUpload.DropzoneContent>
                </>}
              </FileUpload.Dropzone>
            </FileUpload.Root> }
            {file != null && <PDFViewer engine={pdfJs} file={file} cursor={pdfViewerCursor}></PDFViewer>}
            { file != null && <Button  colorPalette={'blue'} onClick={handleConvert} loading={isUploading} variant="surface" width={'100%'}>
              فرغ النص
            </Button> }
            { file != null && !isProcessing && <Button  colorPalette={'gray'} onClick={handleReset} loading={isUploading} variant="outline" width={'100%'}>
              رفع كتاب آخر            
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
          <VStack gap={5} flex={1}> 
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
                  <Progress.Root width="md" max={100} value={isDone ? 100 : currentProgress} colorPalette={isDone ? "green" : "blue"}>
                    <HStack gap="5">
                      <Progress.Track flex="1">
                        <Progress.Range />
                      </Progress.Track>
                      <Progress.ValueText>{isDone ? 100 : currentProgress}%</Progress.ValueText>
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
        <Badge as="div" style={{ width: "min-content" }} size="lg"> رقم الإصدار : { process.env.version }</Badge>
      </VStack>
    </Container>
  );
}