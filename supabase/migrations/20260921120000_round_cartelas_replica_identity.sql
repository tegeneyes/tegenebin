-- Fix: realtime DELETE events on round_cartelas carry no old row unless the
-- table uses REPLICA IDENTITY FULL. Without it clients can't tell WHICH cartela
-- was released, so released cartelas stay shown as "taken" until the next fresh
-- fetch. This restores reliable remove-on-release for every client.
ALTER TABLE public.round_cartelas REPLICA IDENTITY FULL;