export function redactSourceError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  return { code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'SOURCE_ERROR', message: message.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1[REDACTED]@').replace(/(password|token|secret)=([^\s;&]+)/gi, '$1=[REDACTED]') }
}
