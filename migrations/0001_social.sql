CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  score INTEGER,
  finished_at INTEGER,
  frames INTEGER
);
CREATE INDEX runs_player_score ON runs(player_id, score DESC);
CREATE TABLE friendships (
  sender TEXT NOT NULL REFERENCES players(id),
  receiver TEXT NOT NULL REFERENCES players(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (sender, receiver),
  CHECK (sender <> receiver)
);
CREATE UNIQUE INDEX friendship_pair ON friendships(min(sender,receiver),max(sender,receiver));
