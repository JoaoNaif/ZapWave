-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "last_message_at" TIMESTAMP(3);

-- Backfill: conversas que já têm mensagem ganham a data da mais recente
UPDATE "conversations" c
SET "last_message_at" = m."max_created_at"
FROM (
  SELECT "conversation_id", MAX("created_at") AS "max_created_at"
  FROM "messages"
  GROUP BY "conversation_id"
) m
WHERE m."conversation_id" = c."id";
