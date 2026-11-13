# Rack Builder

Plan a 10" or 19" server rack in the browser. Equipment is on the left, the rack is on the right in a 3D view you
can orbit, and you drag one into the other. Everything snaps to standard rack units (1U = 44.45 mm).

- **Build**: choose the rack size (or a real rack), drag equipment in, put mini PCs on shelves.
- **Plan**: list what you own and get a suggested rack height, plus real racks of that size.
- **3D print**: what printing the current rack takes on your printer: rail splits, hardware, filament.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run lint && npm test && npm run build
```

The rack is saved in the browser as you work. File → Export gives a JSON file, and File → Copy share link puts the
whole rack in a URL.

## Equipment data

Each catalog entry in `src/catalog/` has real dimensions and a link to where they came from. `verified: true` means
the numbers were read on that page; anything else shows an "unchecked" tag in the app, because a rack plan built on
a guessed depth is worse than no plan. `research/` holds the raw notes behind the current numbers.
`src/catalog/catalog.test.ts` rejects entries that cannot be right (taller than their rack units, wider than the rack
opening), so run the tests after adding one.

## Real 3D models

Devices are drawn from their catalog dimensions. To show a real model instead, put a `.glb` in `public/models/` and
add `{ "itemId", "file", "title", "author", "licence", "sourceUrl" }` to `src/catalog/models.json`. The model is
stretched to the catalog dimensions, so it can never disagree with the fit checks, and it is listed under
File → 3D model credits. Only add models whose licence allows redistribution (CC0, CC BY, MIT).
