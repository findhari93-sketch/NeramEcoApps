/**
 * Payment Test Fixtures
 *
 * Pre-defined payment and coupon data for testing.
 */

export const mockPayments = [
  {
    id: 'payment-001',
    user_id: 'student-uuid-002',
    course_id: 'course-nata-2024',
    amount: 20000,
    currency: 'INR',
    payment_method: 'razorpay' as const,
    razorpay_order_id: 'order_test123',
    razorpay_payment_id: 'pay_test123',
    razorpay_signature: 'signature_test123',
    status: 'completed' as const,
    receipt_number: 'NERAM-2024-0001',
    coupon_code: 'YOUTUBE10',
    discount_amount: 2000,
    notes: null,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'payment-002',
    user_id: 'lead-uuid-001',
    course_id: 'course-jee-2024',
    amount: 25000,
    currency: 'INR',
    payment_method: 'upi_screenshot' as const,
    razorpay_order_id: null,
    razorpay_payment_id: null,
    razorpay_signature: null,
    status: 'pending' as const,
    receipt_number: null,
    coupon_code: null,
    discount_amount: 0,
    notes: 'Screenshot uploaded, awaiting verification',
    created_at: '2024-01-20T00:00:00Z',
    updated_at: '2024-01-20T00:00:00Z',
  },
];

export const mockCoupons = [
  {
    id: 'coupon-youtube-10',
    code: 'YOUTUBE10',
    description: 'YouTube subscription reward - 10% off',
    discount_type: 'percentage' as const,
    discount_value: 10,
    min_amount: 5000,
    max_discount: 3000,
    valid_from: '2024-01-01T00:00:00Z',
    valid_until: '2024-12-31T23:59:59Z',
    usage_limit: 1000,
    used_count: 150,
    applicable_courses: ['course-nata-2024', 'course-jee-2024'],
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'coupon-early-bird',
    code: 'EARLYBIRD2024',
    description: 'Early bird discount - Flat Rs.5000 off',
    discount_type: 'fixed' as const,
    discount_value: 5000,
    min_amount: 15000,
    max_discount: null,
    valid_from: '2024-01-01T00:00:00Z',
    valid_until: '2024-02-28T23:59:59Z',
    usage_limit: 100,
    used_count: 45,
    applicable_courses: null, // Applicable to all courses
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
];

export const mockYouTubeSubscriptionCoupon = {
  id: 'yt-coupon-001',
  user_id: 'student-uuid-002',
  channel_id: 'UC-neram-channel-id',
  subscription_id: 'yt-subscription-123',
  coupon_code: 'YOUTUBE10',
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  created_at: '2024-01-10T00:00:00Z',
};

export const mockPaymentInstallment = {
  id: 'installment-001',
  payment_id: 'payment-002',
  user_id: 'lead-uuid-001',
  installment_number: 1,
  amount: 8334,
  due_date: '2024-02-15',
  paid_date: null,
  status: 'pending' as const,
  reminder_sent_at: null,
  late_fee: 0,
  is_waived: false,
  notes: null,
  created_at: '2024-01-20T00:00:00Z',
  updated_at: '2024-01-20T00:00:00Z',
};

// Razorpay mock responses
export const mockRazorpayOrder = {
  id: 'order_test123',
  entity: 'order',
  amount: 2000000, // Amount in paise (Rs. 20000)
  amount_paid: 0,
  amount_due: 2000000,
  currency: 'INR',
  receipt: 'receipt_test123',
  status: 'created',
  attempts: 0,
  created_at: 1705305600,
};

export const mockRazorpayPayment = {
  id: 'pay_test123',
  entity: 'payment',
  amount: 2000000,
  currency: 'INR',
  status: 'captured',
  order_id: 'order_test123',
  method: 'upi',
  description: 'NATA Complete Course 2024',
  captured: true,
  created_at: 1705305700,
};
