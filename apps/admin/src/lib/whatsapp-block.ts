/**
 * The per-entity reasons inside a WA_ACCOUNT_BLOCKED string from
 * getWhatsAppSendBlock(), e.g. "WABA #141008: The WABA status is not active."
 */
export function blockReasons(block: string): string {
  const m = block.match(/cannot send \((.*)\)\. /);
  return m ? m[1] : block.replace(/^WA_ACCOUNT_BLOCKED:\s*/, '');
}
