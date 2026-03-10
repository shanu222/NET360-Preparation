export type NetPaymentMethod = 'easypaisa' | 'jazzcash' | 'bank_transfer';

export const NET360_ADMIN_WHATSAPP = '+923403318127';
export const NET360_ADMIN_WHATSAPP_LINK = 'https://wa.me/923403318127';

export const PAYMENT_METHODS: Record<NetPaymentMethod, {
  label: string;
  instructions: string;
  accountLabel: string;
  accountValue: string;
  holderLabel?: string;
  holderValue?: string;
}> = {
  easypaisa: {
    label: 'Easypaisa',
    instructions: 'Send payment from any Easypaisa wallet, then paste transaction ID and upload receipt screenshot.',
    accountLabel: 'Easypaisa Number',
    accountValue: '03403318127',
    holderLabel: 'Account Holder',
    holderValue: 'NET360 Admin',
  },
  jazzcash: {
    label: 'JazzCash',
    instructions: 'Transfer via JazzCash app and keep transaction receipt for proof upload.',
    accountLabel: 'JazzCash Number',
    accountValue: '03403318127',
    holderLabel: 'Account Holder',
    holderValue: 'NET360 Admin',
  },
  bank_transfer: {
    label: 'Bank Transfer',
    instructions: 'Use bank app/branch transfer. Upload the transaction slip or screenshot in payment proof.',
    accountLabel: 'IBAN',
    accountValue: 'PK36HABB0000001234567890',
    holderLabel: 'Account Title',
    holderValue: 'NET360 Admin',
  },
};
