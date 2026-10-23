/**
 * EZRAB AI — robust tool-call extraction from raw model text (F3).
 *
 * The old service used ONE rigid regex:
 *   /\{"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[\s\S]*?\})\s*\}/
 * which broke in four verified ways:
 *  - key order had to be exactly "tool" then "args" (args-first = no match,
 *    so the raw JSON leaked to the user as the "reply");
 *  - the non-greedy args capture stopped at the first '}', truncating
 *    nested args objects;
 *  - args that failed JSON.parse were silently replaced with {} and the
 *    tool RAN ANYWAY on empty arguments;
 *  - only the first call in a reply was ever seen.
 *
 * This scanner instead walks every '{' in the text, takes its string-aware
 * BALANCED span (via providerClient.balancedJsonEnd), and JSON.parses it:
 *  - key order is irrelevant, nested args survive intact;
 *  - up to MAX_TOOL_CALLS valid calls are collected, in order;
 *  - a balanced span that mentions "tool" but does not parse (or whose
 *    args is not a plain object) is MALFORMED: it is stripped from the
 *    visible text and flagged, never executed;
 *  - plain JSON that is not a tool call (no string "tool" key) is left
 *    untouched and never treated as a call.
 * Raw tool-call JSON therefore never reaches the user in any path.
 */
import { balancedJsonEnd } from '../providerClient';

export const MAX_TOOL_CALLS = 3;

export interface ParsedToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolCallScan {
  /** Valid, executable calls (max MAX_TOOL_CALLS), in order of appearance. */
  calls: ParsedToolCall[];
  /** True when at least one tool-call-shaped block was present but unusable. */
  malformed: boolean;
  /** Model text with every tool-call block (valid or malformed) removed. */
  cleanText: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Heuristic: does this balanced span look like an attempted tool call? */
function looksLikeToolCall(spanText: string): boolean {
  return /"tool"\s*:/.test(spanText);
}

export function scanToolCalls(content: string): ToolCallScan {
  const calls: ParsedToolCall[] = [];
  let malformed = false;
  if (!content) return { calls, malformed, cleanText: '' };

  const removeRanges: Array<[number, number]> = [];
  let i = 0;
  let scanned = 0;
  while (i < content.length && scanned < 200) {
    if (content[i] !== '{') {
      i++;
      continue;
    }
    scanned++;
    const end = balancedJsonEnd(content, i);
    if (end === -1) {
      // Unbalanced from here on — if the remainder still looks like a
      // tool-call attempt, flag it malformed and hide it from the user.
      const rest = content.slice(i);
      if (looksLikeToolCall(rest)) {
        malformed = true;
        removeRanges.push([i, content.length]);
      }
      break;
    }
    const span = content.slice(i, end);
    if (looksLikeToolCall(span)) {
      let parsed: unknown = undefined;
      let parseOk = true;
      try {
        parsed = JSON.parse(span.replace(/,\s*([}\]])/g, '$1'));
      } catch {
        parseOk = false;
      }
      const valid =
        parseOk &&
        isPlainObject(parsed) &&
        typeof (parsed as Record<string, unknown>).tool === 'string' &&
        ((parsed as Record<string, unknown>).args === undefined ||
          isPlainObject((parsed as Record<string, unknown>).args));
      if (valid) {
        const obj = parsed as Record<string, unknown>;
        if (calls.length < MAX_TOOL_CALLS) {
          calls.push({
            toolName: obj.tool as string,
            args: isPlainObject(obj.args) ? obj.args : {},
          });
        }
        removeRanges.push([i, end]);
      } else {
        malformed = true;
        removeRanges.push([i, end]);
      }
      i = end;
      continue;
    }
    // Not a tool call: step inside so a nested object can still be found.
    i++;
  }

  let cleanText = content;
  if (removeRanges.length) {
    let out = '';
    let last = 0;
    for (const [s, e] of removeRanges) {
      out += content.slice(last, s);
      last = e;
    }
    out += content.slice(last);
    cleanText = out.replace(/\n{3,}/g, '\n\n').trim();
  }
  return { calls, malformed, cleanText };
}
