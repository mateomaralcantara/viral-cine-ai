export const FAL_VIDEO_PROMPT_MAX_LENGTH = 2000;

export type FalFailure = {
  message: string;
  status?: number;
  requestId?: string;
  details: string[];
};

export function normalizeFalVideoPrompt(
  value: string,
  maxLength = FAL_VIDEO_PROMPT_MAX_LENGTH
) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;

  const separator = ' … RESTRICCIONES FINALES: ';
  const tailLength = Math.min(360, Math.max(80, Math.floor(maxLength * 0.2)));
  const headLength = Math.max(1, maxLength - separator.length - tailLength);
  const head = normalized.slice(0, headLength).trimEnd();
  const tail = normalized.slice(-tailLength).trimStart();
  return `${head}${separator}${tail}`.slice(0, maxLength);
}

export function describeFalFailure(error: unknown): FalFailure {
  const record = isRecord(error) ? error : {};
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error desconocido';
  const status = typeof record.status === 'number' ? record.status : undefined;
  const requestId = typeof record.requestId === 'string' && record.requestId.trim()
    ? record.requestId.trim()
    : undefined;
  const body = isRecord(record.body) ? record.body : undefined;
  const detail = body?.detail;
  const details: string[] = [];

  if (typeof detail === 'string' && detail.trim()) {
    details.push(detail.trim());
  } else if (Array.isArray(detail)) {
    for (const item of detail.slice(0, 5)) {
      if (!isRecord(item)) continue;
      const location = Array.isArray(item.loc)
        ? item.loc.map((part) => String(part)).join('.')
        : '';
      const itemMessage = typeof item.msg === 'string' ? item.msg.trim() : '';
      if (itemMessage) details.push(location ? `${location}: ${itemMessage}` : itemMessage);
    }
  }

  return { message, status, requestId, details };
}

export function isGooglePrepayDepleted(message: string) {
  return /prepayment credits are depleted|prepay(?:ment)? credits? (?:are )?(?:depleted|exhausted)|no credits/i.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
