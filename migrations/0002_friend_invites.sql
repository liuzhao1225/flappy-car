ALTER TABLE players ADD COLUMN invite_code TEXT;
UPDATE players SET invite_code=lower(hex(randomblob(16))) WHERE invite_code IS NULL;
CREATE UNIQUE INDEX players_invite_code ON players(invite_code);
