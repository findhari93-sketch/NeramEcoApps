/**
 * Section keys of the translated policies (messages: terms.sections.*,
 * refundPolicy.sections.*). A plain module so the server legal pages and the
 * client drawer content read the same order.
 */
export const TERMS_SECTION_KEYS = [
  'acceptance',
  'definitions',
  'eligibility',
  'enrollment',
  'payment',
  'refundSummary',
  'dataUsage',
  'communication',
  'intellectualProperty',
  'userObligations',
  'prohibitedConduct',
  'scholarship',
  'limitation',
  'indemnification',
  'dispute',
  'modifications',
  'termination',
  'governingLaw',
  'contact',
] as const;

export const REFUND_SECTION_KEYS = [
  'overview',
  'eligibility',
  'processingFee',
  'adminDiscretion',
  'howToRequest',
  'requiredInfo',
  'reviewProcess',
  'refundMethod',
  'installmentPayments',
  'exceptions',
  'contact',
] as const;
