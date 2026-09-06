-- 067: Add SMS provider configuration keys to attendance_settings

INSERT INTO public.attendance_settings (key, value, description) VALUES
  ('sms_provider',    '"termii"',   'SMS provider: termii | africas_talking | twilio'),
  ('sms_api_key',     '""',         'API key for the configured SMS provider'),
  ('sms_sender_id',   '"AMQM"',     'Sender ID / from name shown to recipients'),
  ('sms_channel',     '"generic"',  'Termii channel: generic | dnd | whatsapp'),
  ('sms_account_sid', '""',         'Twilio account SID (Twilio only)'),
  ('sms_auth_token',  '""',         'Twilio auth token (Twilio only)'),
  ('sms_username',    '""',         'Africa''s Talking username (AT only)')
ON CONFLICT (key) DO NOTHING;
