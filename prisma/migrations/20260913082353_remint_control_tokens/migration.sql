-- The initial backfill used random(), a non-cryptographic PRNG, so tokens
-- minted for pre-existing rows were weaker than the CSPRNG tokens signup
-- mints. Re-mint them all from gen_random_uuid(), which is strong-seeded and
-- built in on PG13+. Safe to re-mint unconditionally: the control dock has
-- not shipped, so no dock URL is pinned in anyone's OBS yet.
UPDATE "Overlay"
SET "controlToken" = encode(
  sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')),
  'hex'
);
