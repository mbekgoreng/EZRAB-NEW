/**
 * EZRAB PROJECT COPILOT — UNIFIED CONVERSATION TYPES
 * 
 * Canonical data models for Project Copilot conversations, multi-turn state,
 * tool invocations, and action safety.
 */

import type { AIActionProposal } from '../../unifiedProjectContext';

export type AIMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type AIMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';

export interface AIToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface AIToolStructuredError {
  errorCode: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
}

export interface AIToolResult<T = unknown> {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result?: T;
  error?: AIToolStructuredError;
  provenance?: {
    source: string;
    sourceType: string;
    verifiedAt?: string;
    timestamp?: string;
  };
}

export interface AIMessage {
  id: string;
  conversationId: string;
  projectId: string;
  role: AIMessageRole;
  content: string;
  badge?: 'RAB' | 'KURVA S' | 'LAPORAN' | 'AHSP' | 'WIZARD' | 'ACTION';
  toolCalls?: AIToolCall[];
  toolResults?: AIToolResult[];
  actionProposal?: AIActionProposal;
  table?: {
    headers: string[];
    rows: string[][];
  };
  stats?: {
    label: string;
    value: string;
    sub?: string;
    color?: string;
  };
  wizardResponse?: any;
  quickActionResponse?: any;
  followUpSuggestions?: string[];
  status?: AIMessageStatus;
  isError?: boolean;
  intent?: string;
  createdAt: string;
  timestamp: string; // Formatted for UI display (e.g. "14:30")
}

export interface AIConversation {
  id: string;
  projectId: string;
  organizationId?: string;
  title: string;
  messages: AIMessage[];
  activeMode?: 'chat' | 'ded-rab' | 'dokumen-ai';
  /**
   * Ringkasan percakapan EKSTRAKTIF & DETERMINISTIK (Fase 1 — Canonical
   * Context Intelligence): disimpan per conversationId, diperbarui saat
   * percakapan memanjang. Dipakai builder kanonis sebagai pengganti
   * riwayat mentah yang panjang. Ringkasan TIDAK membawa fakta proyek —
   * fakta selalu datang dari state terstruktur (speks/intake/draft).
   */
  summary?: {
    text: string;
    messageCount: number;
    updatedAt: string;
  };
  createdAt: number;
  updatedAt: number;
}

export type AIConversationEventType =
  | 'CONVERSATION_CREATED'
  | 'CONVERSATION_UPDATED'
  | 'CONVERSATION_DELETED'
  | 'CONVERSATION_SWITCHED'
  | 'MESSAGE_CREATED'
  | 'MESSAGE_UPDATED'
  | 'MESSAGE_STREAMING'
  | 'MESSAGE_COMPLETED'
  | 'MESSAGE_FAILED'
  | 'TOOL_STARTED'
  | 'TOOL_COMPLETED'
  | 'TOOL_FAILED'
  | 'ACTION_PROPOSED'
  | 'ACTION_APPROVED'
  | 'ACTION_REJECTED'
  | 'ACTION_EXECUTED';

export interface AIConversationEvent {
  type: AIConversationEventType;
  conversationId: string;
  projectId: string;
  messageId?: string;
  payload?: unknown;
  timestamp: string;
}

export type AIConversationListener = (event: AIConversationEvent) => void;
