export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  [key: string]: unknown;
}

export interface WhatsAppStatusChange {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}

export interface WhatsAppWebhookChangeValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: {
      name: string;
    };
    wa_id: string;
  }>;
  messages?: WhatsAppIncomingMessage[];
  statuses?: WhatsAppStatusChange[];
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: WhatsAppWebhookChangeValue;
    field: string;
  }>;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry?: WhatsAppWebhookEntry[];
}
