/** The last ten digits of an Indian mobile, for fields that add +91 themselves. */
export function tenDigitPhone(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '').slice(-10);
}
