-- Venue map links + full club/venue names and addresses.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS map_url TEXT;

-- S.V. Triaz
UPDATE clubs
SET
  name = 'S.V. Triaz',
  address_line1 = 'Van Heenvlietlaan 6',
  postal_code = '1083 CL',
  city = 'Amsterdam',
  latitude = 52.330343,
  longitude = 4.882560
WHERE slug = 'triaz';

UPDATE venues
SET
  name = 'S.V. Triaz',
  address_line1 = 'Van Heenvlietlaan 6',
  postal_code = '1083 CL',
  city = 'Amsterdam',
  map_url = 'https://maps.google.com/?q=S.V.+Triaz+Van+Heenvlietlaan+6+Amsterdam'
WHERE slug = 'triaz';

-- Tennispark Randwijck
UPDATE clubs
SET
  name = 'Tennispark Randwijck',
  address_line1 = 'Barend van Dorenweerdelaan 16',
  postal_code = '1181 BK',
  city = 'Amstelveen',
  latitude = 52.312500,
  longitude = 4.865000
WHERE slug = 'randwijck';

UPDATE venues
SET
  name = 'Tennispark Randwijck',
  address_line1 = 'Barend van Dorenweerdelaan 16',
  postal_code = '1181 BK',
  city = 'Amstelveen',
  map_url = 'https://maps.google.com/?q=Tennispark+Randwijck+Barend+van+Dorenweerdelaan+16+Amstelveen'
WHERE slug = 'randwijck';

-- Coach calendar feed scope.
ALTER TYPE calendar_feed_scope ADD VALUE IF NOT EXISTS 'coach';
