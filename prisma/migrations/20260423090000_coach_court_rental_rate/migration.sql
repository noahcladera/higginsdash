-- Per-coach override for private-lesson court rental (EUR/hour); null uses app default.
ALTER TABLE "coaches" ADD COLUMN "court_rental_rate" DECIMAL(10,2);
