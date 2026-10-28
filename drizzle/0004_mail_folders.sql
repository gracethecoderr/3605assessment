ALTER TABLE email_messages ADD COLUMN in_inbox integer NOT NULL DEFAULT 1;
ALTER TABLE email_messages ADD COLUMN sent integer NOT NULL DEFAULT 0;
ALTER TABLE email_messages ADD COLUMN trashed integer NOT NULL DEFAULT 0;
UPDATE email_messages SET sent = 1, in_inbox = 0
WHERE EXISTS (SELECT 1 FROM gmail_accounts a WHERE a.user_id = email_messages.user_id AND lower(a.email) = lower(email_messages.from_email));
