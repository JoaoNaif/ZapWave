-- CreateIndex
CREATE INDEX "friendships_sender_id_recipient_id_idx" ON "friendships"("sender_id", "recipient_id");

-- CreateIndex
CREATE INDEX "friendships_recipient_id_idx" ON "friendships"("recipient_id");

-- CreateIndex
CREATE INDEX "conversations_members_user_id_idx" ON "conversations_members"("user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_id_idx" ON "messages"("conversation_id", "id");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "rooms_invites_invitee_id_status_idx" ON "rooms_invites"("invitee_id", "status");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at");

