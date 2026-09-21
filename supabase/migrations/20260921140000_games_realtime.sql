-- Broadcast game finishes to every player/watcher in the round so the calls
-- stop the moment a winner is recorded and spectators see who won.
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
-- UPDATE/DELETE realtime payloads only carry the columns in replica identity.
-- FULL ensures round_index + winner details are delivered for the
-- loser-records-first -> winner-upgrade path in finish_game.
ALTER TABLE public.games REPLICA IDENTITY FULL;