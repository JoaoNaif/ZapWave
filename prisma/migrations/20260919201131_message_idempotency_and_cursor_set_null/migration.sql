-- DropForeignKey
ALTER TABLE "conversations_members" DROP CONSTRAINT "conversations_members_last_read_message_id_fkey";

-- DropForeignKey
ALTER TABLE "devices" DROP CONSTRAINT "devices_resume_cursor_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_sender_id_client_message_id_key" ON "messages"("conversation_id", "sender_id", "client_message_id");

-- AddForeignKey
ALTER TABLE "conversations_members" ADD CONSTRAINT "conversations_members_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_resume_cursor_id_fkey" FOREIGN KEY ("resume_cursor_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
