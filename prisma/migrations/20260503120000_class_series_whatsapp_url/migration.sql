-- Add optional WhatsApp group invite link to a class series.
-- Surfaced in enrolled-student views and confirmation emails so a parent
-- can jump straight into the series chat (chat.whatsapp.com/...).
ALTER TABLE "class_series"
  ADD COLUMN "whatsapp_url" TEXT;
