/**
 * Events that are actually happening.
 *
 * Its own module, not a const in `index.ts`: that file calls `seed()` at the
 * bottom of itself, so anything importing a value out of it would run the
 * whole import. `verify.ts` needs to read these to check them.
 *
 * `base.EVENTS` is 20 invented listings-parties behind `SEED_MOCK_CONTENT`, so
 * before this there was no way to seed a real one. These are authored here, in
 * both locales, because the announcements they come from are Spanish and the
 * EN→ES dictionary the rest of the seed leans on has never seen them.
 *
 * `listing` is a slug from `data-import/listings.json`, resolved after the
 * research loop. `photo` follows `LISTING_PHOTO`'s shape.
 */
export const REAL_EVENTS = [
  {
    slug: 'encuentro-casa-marin',
    date: '2026-09-06',
    kind: 'church', // labelled COMMUNITY
    listing: 'casa-marin',
    /**
     * The volunteers, not the food.
     *
     * The flyer's plate of pork steaks is still on disk at
     * `assets/events/encuentro-casa-marin.jpg` — it is a real photograph from
     * the announcement and nothing is wrong with it, it simply made a meal
     * between neighbours look like a menu. It is left there rather than
     * deleted, and nothing reads it.
     *
     * Its media *document* survives too, in any database that has already been
     * seeded — the seed only upserts, so nothing deletes the old row or its
     * variants off the volume. A database seeded from empty never grows one.
     *
     * This is the same frame as the club's own listing hero, cropped from the
     * club's original at (0,400)–(1080,1008) — measured against
     * `assets/businesses/el-club-de-la-amistad.jpg`, not guessed — but taken
     * from the source file so it comes without the club seal burnt into the
     * top-left corner. That corner is where the event page now draws the
     * venue's mark.
     *
     * NOTE the filename had to change. `upsertMedia` keys on basename and
     * returns the existing document on a match, so overwriting the old file in
     * place would have re-seeded cleanly and still served the pork chops.
     */
    photo: {
      file: 'assets/events/encuentro-casa-marin-voluntarias.jpg',
      altEn: 'Seven volunteers of the Club de la Amistad in pink club shirts, standing shoulder to shoulder against a slatted wood wall.',
      altEs: 'Siete voluntarias del Club de la Amistad con camisas rosadas del club, hombro con hombro ante una pared de listones de madera.',
      credit: 'Club de la Amistad por un Hialeah Mejor',
    },
    // Breakfast, and the hour is settled. `startTime` is what the .ics reads;
    // `timeLabel` is what the page prints. They are the same instant said
    // twice and nothing enforces that, so they change together or not at all.
    startTime: '09:00',
    en: {
      title: "We're meeting at Casa Marín",
      timeLabel: '9:00 AM',
      freeLabel: 'MEMBERS AND VOLUNTEERS',
      note: 'Breakfast among neighbours, members and volunteers of the Club de la Amistad, at the table of a Palm Avenue restaurant that has always been there.',
    },
    es: {
      title: 'Nos reunimos en Casa Marín',
      timeLabel: '9:00 AM',
      freeLabel: 'SOCIOS Y VOLUNTARIOS',
      note: 'Un desayuno entre vecinos, socios y voluntarios del Club de la Amistad, en la mesa de un restaurante de siempre en Palm Avenue.',
    },
  },
]
