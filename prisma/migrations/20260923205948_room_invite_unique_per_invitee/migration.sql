-- CreateIndex
CREATE UNIQUE INDEX "rooms_invites_conversation_id_invitee_id_key" ON "rooms_invites"("conversation_id", "invitee_id");
