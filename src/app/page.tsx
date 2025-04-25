"use client";

import { useState } from 'react';
import {
  Box,
  Button,
  Container,
  Heading,
  Textarea,
  VStack,
  Spinner,
} from '@chakra-ui/react';
import { Toaster, toaster } from '@/components/ui/toaster';
import { FileUpload, Icon } from '@chakra-ui/react';
import { LuUpload } from 'react-icons/lu';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [markdownResult, setMarkdownResult] = useState([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFile(file);
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
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/convert-to-markdown', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to convert PDF');
      }

      const data = await response.json();
      setMarkdownResult(data.markdown || []);
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
    }
  };

  return (
    <Container fluid={true} py={10}>
      <Toaster />
      <Container centerContent={true}>
        <Heading mb={6}>PDF to Markdown & Dubbing Script</Heading>
        <VStack gap={5}>
          <FileUpload.Root
            alignItems="stretch"
            maxFiles={10}
            onChange={handleFileChange}
          >
            <FileUpload.HiddenInput />
            <FileUpload.Dropzone>
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
            <FileUpload.List />
          </FileUpload.Root>
          <Button onClick={handleConvert} loading={isLoading} variant="surface">
            Convert to Markdown
          </Button>
          {isLoading && <Spinner />}
          {markdownResult.length > 0 && (
            <Box>
              <Heading size="md" mb={3}>
                Markdown Output
              </Heading>
              {markdownResult.map((text, idx) => (
                <Textarea
                  key={idx}
                  value={text}
                  readOnly
                  mb={4}
                  height="200px"
                />
              ))}
            </Box>
          )}
        </VStack>
      </Container>
    </Container>
  );
}
