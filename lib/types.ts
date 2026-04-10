export type RapportStatus =
  | 'draft'
  | 'pdf_generated'
  | 'zip_created'
  | 'email_sent'
  | 'email_delivered'
  | 'email_failed'
  | 'purged';

export interface EmailEvent {
  id: string;
  rapport_id: string;
  event_type: 'sent' | 'delivered' | 'bounced' | 'complained' | 'resent';
  resend_email_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}
