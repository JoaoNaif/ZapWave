-- O cursor do device guarda também ids de evento (edição/remoção), que não existem em messages
ALTER TABLE "devices" DROP CONSTRAINT "devices_resume_cursor_id_fkey";
