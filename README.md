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

On a phone the list becomes a sheet you pull up from the bottom, and you add equipment with its + button or by
pressing and holding it and dragging it into the rack.

The rack is saved in the browser as you work. File → Export gives a JSON file, and File → Copy share link puts the
whole rack in a URL.

## Equipment data

Each catalog entry in `src/catalog/` has real dimensions and a link to where they came from. `verified: true` means
the numbers were read on that page; anything else shows an "unchecked" tag in the app, because a rack plan built on
a guessed depth is worse than no plan. `research/` holds the raw notes behind the current numbers.
`src/catalog/catalog.test.ts` rejects entries that cannot be right (taller than their rack units, wider than the rack
opening), so run the tests after adding one.

## Photos and real 3D models

Devices are drawn from their catalog dimensions. In the realistic look a device shows a front and rear photo when
`src/catalog/elevations.json` lists one for it. The photos in `public/elevations/` come from the NetBox device-type
library, which is CC0. A photo is fitted to the height of the face, so it only looks right when it is cropped to the
device. The port positions in the catalog are what cables plug into: when you add a photo, check that the ports of
that item line up with it.

To show a real model instead, put a `.glb` in `public/models/` and add
`{ "itemId", "file", "title", "author", "licence", "sourceUrl" }` to `src/catalog/models.json`. The model is squeezed
into the catalog dimensions so it can never disagree with the fit checks, and it is credited under File → Credits.
Only add models whose licence allows redistribution (CC0, CC BY, MIT). GrabCAD files may not be shipped.

## Hosting

The site is static files, so it runs as one small nginx container and keeps nothing on the server: each rack lives in
the visitor's browser.

`docker-compose.yml` is written to be a Portainer stack created from this repository (Stacks → Add stack →
Repository, compose path `docker-compose.yml`) with **GitOps updates** on. Portainer then polls the repository and, on
a new commit, builds the image on the server and replaces the container. No image registry is involved. The compose
file sets `pull_policy: build` because Compose would otherwise keep using the image built from the previous commit.

The stack joins the network of the `websites` stack, which must already exist, so that stack's Cloudflare tunnel can
reach the site as `http://rack-builder:80`. On the LAN it listens on port 8090; set `RACK_BUILDER_PORT` in the stack's
environment variables to change that.

A commit that does not build leaves the previous container running; Portainer shows the failed deploy on the stack.
CI builds the same image and runs `deploy/smoke.sh` against it, so look at CI first.
