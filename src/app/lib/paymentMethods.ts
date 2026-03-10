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
  extraDetails?: Array<{
    label: string;
    value: string;
    copyable?: boolean;
  }>;
}> = {
  easypaisa: {
    label: 'Easypaisa',
    instructions: 'Send payment from any Easypaisa wallet, then paste transaction ID and upload receipt screenshot.',
    accountLabel: 'Easypaisa Number',
    accountValue: '03403318127',
    holderLabel: 'Account Title',
    holderValue: 'Shahnawaz',
  },
  jazzcash: {
    label: 'JazzCash',
    instructions: 'Transfer via JazzCash app and keep transaction receipt for proof upload.',
    accountLabel: 'JazzCash Number',
    accountValue: '03403318127',
    holderLabel: 'Account Title',
    holderValue: 'Shahnawaz',
  },
  bank_transfer: {
    label: 'Bank Transfer',
    instructions: 'Use bank app/branch transfer. Upload the transaction slip or screenshot in payment proof.',
    accountLabel: 'Account Number',
    accountValue: '24897000279603',
    holderLabel: 'Account Title',
    holderValue: 'Shahnawaz',
    extraDetails: [
      {
        label: 'Bank',
        value: 'HBL (Habib Bank Limited)',
      },
      {
        label: 'Branch',
        value: 'Karsaz, Karachi',
      },
      {
        label: 'IBAN',
        value: 'PK43HABB0024897000279603',
        copyable: true,
      },
    ],
  },
};
