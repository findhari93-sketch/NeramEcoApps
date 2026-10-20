/**
 * Real KVB alert shapes from the trust account (collected 2026-10-20), with
 * names, references and balances changed. Each entry keeps the exact wording,
 * spacing and punctuation the bank sends, because that is what the parser must
 * survive. Used by bank-alert-parser.test.ts and by Admin's "test the parser"
 * box later.
 */
export interface AlertFixture {
  name: string;
  source: 'sms' | 'email' | 'notification';
  sender: string;
  subject?: string;
  text: string;
}

export const KVB_ALERT_FIXTURES: Record<string, AlertFixture> = {
  smsUpiCredit: {
    name: 'KVB UPI credit SMS',
    source: 'sms',
    sender: 'JD-KVBUPI-S',
    text: 'Your a/c XXXXXXXXXXXX1183 is credited Rs. 15000.00 from ARUN KUMAR R on 16-Oct-2026.info :UPI/P2A/628900000001. Avl Bal INR 25229.82 -KVB',
  },
  smsUpiCreditLongName: {
    name: 'KVB UPI credit SMS, long payer name, other telecom route',
    source: 'sms',
    sender: 'VA-KVBUPI-S',
    text: 'Your a/c XXXXXXXXXXXX1183 is credited Rs. 15000.00 from PRIYA SUDHIR KOOTHAPALEKEL on 12-Oct-2026.info :UPI/P2A/628500000002. Avl Bal INR 30229.82 -KVB',
  },
  smsUpiCreditWithPaise: {
    name: 'KVB UPI credit SMS with a paise tag',
    source: 'sms',
    sender: 'JD-KVBUPI-S',
    text: 'Your a/c XXXXXXXXXXXX1183 is credited Rs. 25000.37 from RADHIKA K on 21-Oct-2026.info :UPI/P2A/629000000003. Avl Bal INR 55229.82 -KVB',
  },
  smsUpiDebit: {
    name: 'KVB UPI debit SMS (money going out)',
    source: 'sms',
    sender: 'JD-KVBUPI-S',
    text: 'Your a/c XXXXXXXXXXXX1183 is debited Rs. 1061.00 to BSNL on 06-Oct-2026.info :UPI/P2M/628100000004. Avl Bal INR 24168.82 -KVB',
  },
  smsOtp: {
    name: 'KVB one-time token',
    source: 'sms',
    sender: 'VK-KVBANK-S',
    text: 'On-Demand Tokencode 482913 Valid for 2 mins and Keep it confidential -KVB',
  },
  smsOtherBank: {
    name: 'Another bank, another account',
    source: 'sms',
    sender: 'BV-INDBNK-S',
    text: 'Your A/C xx7911 is classified as inoperative. Please visit the branch -Indian Bank',
  },
  smsRecharge: {
    name: 'Telecom recharge, not a bank',
    source: 'sms',
    sender: 'JG-JioPay-S',
    text: 'Recharge Successful ! Plan Name : 39.00 Rs. 39 credited to your Jio account',
  },
  emailImpsCredit: {
    name: 'KVB IMPS credit email',
    source: 'email',
    sender: 'KVB-no.reply@kvb.bank.in',
    subject: 'IMPS Alert from KVB',
    text: 'Dear Customer,\n\nThis is to inform you that,\n\nYour a/c no. XXXXXXXXXXXX1183 is credited by INR 35,000.00 on 31-08-26 by a/c linked to mobile xxxxxx6177 (IMPS Ref no. 624300000005). Avl Bal INR 72,267.13 -KVB\n\nNote: Notify the bank immediately in case you notice unauthorized transactions in your KVB (Karur Vysya Bank) account.',
  },
  emailNeftInward: {
    name: 'KVB NEFT inward email (plain text with HTML leftovers)',
    source: 'email',
    sender: 'KVB-no.reply@kvb.bank.in',
    subject: 'NEFT Alert from KVB',
    text:
      'Dear Customer,\n\n        Greetings from Karur Vysya Bank...!,\n                      \n         \nYOU HAVE RECEIVED AN NEFT INWARD\n\n            Date : 24-JUL-26\n\n            Acct No : XXXX01183\n\n            Amt : 15,000.00\n\n            Sender Name : KARTHIK R\n\n            Sender Bank IFSC Code :CNRB0001269\n\n            Sender Bank Acct No : XXXX6539\n\n            Sender Address :KARTHIK R\n\n          ; Remit Info :K MRUDULA FEES\n\n  &n bsp;         Ref No : CNRBH00100000006\n\n            HAS BEEN CREDITED. PENDING VERIFICATION.\n\nRegards,\nKarur Vysya Bank',
  },
  emailNeftOutward: {
    name: 'KVB NEFT outward email (our own transfer, a debit)',
    source: 'email',
    sender: 'KVB-no.reply@kvb.bank.in',
    subject: 'NEFT Alert from KVB (Ref.No: KVBLH00200000007)',
    text: 'Dear Customer,\n\nThis is to inform you that,\n\nYour NEFT Transfer of INR: 40,000.00 from A/c No:XX01183 to STONE MATE Ref No : KVBLH00200000007 is settled. Avl Bal INR 1,73,075.13 -KVB',
  },
  emailCashDeposit: {
    name: 'KVB cash deposit at a CDM',
    source: 'email',
    sender: 'KVB-no.reply@kvb.bank.in',
    subject: 'Credit Alert from KVB (A/c: XXXX1183)',
    text: 'Dear Customer,\n\nThis is to inform you that,\n\nA/c**1183 Credited Rs.49,500.00 on 16-JUL-2026 17:20:45"CASH DEPOSIT AT CDM-S1ECD100008",Avl Bal Rs.2,27,183.13 -KVB',
  },
  emailBalanceAlert: {
    name: 'KVB daily balance line (no transaction)',
    source: 'email',
    sender: 'KVB-no.reply@kvb.bank.in',
    subject: 'Balance Alert from KVB (A/c:XXXX1183)',
    text: 'Dear Customer,\n\nThis is to inform you that,\n\nINR 23,219.82 is the Balance in a/c ****1183 as of 04-OCT-2026 00:13:28 * Download KVB-DLite mobile app from https://example.invalid/app',
  },
  emailPromo: {
    name: 'KVB marketing email',
    source: 'email',
    sender: 'Karur Vysya Bank',
    subject: 'To Receive Money, You never need to Enter your UPI pin',
    text: 'To Receive Money, You never need to Enter your UPI pin. Stay safe. DISCLAIMER- THE KARUR VYSYA BANK LIMITED',
  },
  gpayNotification: {
    name: 'Google Pay "paid you" notification (full text, not the truncated shade)',
    source: 'notification',
    sender: 'com.google.android.apps.nbu.paisa.user',
    text: 'ARUN KUMAR R paid you ₹15,000',
  },
  gpayNotificationWithPaise: {
    name: 'Google Pay "paid you" notification with paise',
    source: 'notification',
    sender: 'com.google.android.apps.nbu.paisa.user',
    text: 'RADHIKA K paid you ₹25,000.37',
  },
  gpayNotificationRequest: {
    name: 'Google Pay request (not money)',
    source: 'notification',
    sender: 'com.google.android.apps.nbu.paisa.user',
    text: 'ARUN KUMAR R requested ₹500 from you',
  },
};
