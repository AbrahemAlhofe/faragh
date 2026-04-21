"use client";
import { useEffect, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Icon,
  Spinner,
  Badge,
  IconButton,
  Button
} from '@chakra-ui/react';
import { Session } from '@/lib/types';
import { LuBook, LuHistory, LuPlus, LuBookPlus, LuTrash2 } from 'react-icons/lu';

interface SidebarProps {
  currentSessionId: string | null;
  sessions: Session[];
  isLoading: boolean;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewSession: () => void;
}

export default function Sidebar({ currentSessionId, sessions, isLoading, onSelectSession, onDeleteSession, onNewSession }: SidebarProps) {

  return (
    <Box
      width={{ base: 'full', lg: '280px' }}
      bg="gray.950"
      borderRight="1px solid"
      borderColor="gray.800"
      height="100vh"
      position="sticky"
      top="0"
      display={{ base: 'none', lg: 'flex' }}
      flexDirection="column"
      color="white"
    >
      <VStack p={6} pb={2} alignItems="stretch" gap={4}>
        <HStack justifyContent="space-between" width="100%">
          <HStack gap={2}>
            <Icon as={LuHistory} boxSize={5} color="fg.muted" />
            <Text fontSize="lg" fontWeight="bold">السجلات</Text>
          </HStack>
          <IconButton
            aria-label="New Session"
            icon={<LuPlus />}
            size="sm"
            variant="ghost"
            colorPalette="blue"
            onClick={onNewSession}
          />
        </HStack>

        <Button
          onClick={onNewSession}
          variant="solid"
          colorPalette="blue"
          size="md"
          width="100%"
          justifyContent="flex-start"
          gap={3}
        >
          <Icon as={LuBookPlus} />
          <Text>تفريغ جديد</Text>
        </Button>
      </VStack>

      <VStack
        flex="1"
        alignItems="stretch"
        overflowY="auto"
        px={3}
        py={4}
        gap={1}
        css={{
          '&::-webkit-scrollbar': { width: '4px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { background: '#2D3748', borderRadius: '10px' },
        }}
      >
        {isLoading ? (
          <VStack py={10}>
            <Spinner size="sm" color="blue.400" />
          </VStack>
        ) : sessions.length === 0 ? (
          <Text fontSize="sm" color="gray.500" textAlign="center" py={10}>
            لا توجد سجلات بعد
          </Text>
        ) : (
          sessions.map((session) => (
            <Box
              key={session.id}
              p={3}
              borderRadius="md"
              cursor="pointer"
              transition="all 0.2s"
              bg={currentSessionId === session.id ? 'whiteAlpha.100' : 'transparent'}
              _hover={{ bg: 'whiteAlpha.50' }}
              onClick={() => onSelectSession(session.id)}
              borderRight="2px solid"
              borderColor={currentSessionId === session.id ? 'blue.400' : 'transparent'}
            >
              <VStack alignItems="stretch" gap={1}>
                <HStack gap={3}>
                  <Icon as={LuBook} boxSize={4} color={currentSessionId === session.id ? 'blue.400' : 'gray.500'} />
                  <Text
                    fontSize="sm"
                    fontWeight={currentSessionId === session.id ? 'bold' : 'medium'}
                    noOfLines={1}
                    dir="rtl"
                  >
                    {session.filename.replace('.pdf', '')}
                  </Text>
                </HStack>
                <HStack justifyContent="space-between">
                  <Text fontSize="xs" color="gray.500">
                    {new Date(session.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                  </Text>
                  <IconButton
                    aria-label="Delete Session"
                    size="xs"
                    variant="ghost"
                    colorPalette="red"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('هل أنت متأكد من مسح هذه الجلسة ؟')) {
                        onDeleteSession(session.id);
                      }
                    }}
                  >
                    <LuTrash2 />
                  </IconButton>
                </HStack>
              </VStack>
            </Box>
          ))
        )}
      </VStack>

      <Box p={4} borderTop="1px solid" borderColor="gray.800">
        <Text fontSize="xs" color="gray.500" textAlign="center">
          فراغ استوديو • {new Date().getFullYear()} • v{process.env.version}
        </Text>
      </Box>
    </Box>
  );
}
