# Pinpoint Media Notes

An Obsidian plugin that creates a note with a cover image from an exact
identifier, instead of a title search:

- a book's **ISBN**: printed book, e-book or audiobook, from the catalogue of
  the Deutsche Nationalbibliothek (DNB),
- a **TMDB URL**: movie or series, in the language you configure.

Each note gets a fixed frontmatter schema and a local copy of the cover or
poster.

> **Status:** in development. Both importers work; the full documentation
> follows. For the movie and series import, set the notes folder and your
> TMDB API read access token in the plugin settings, then run **Pinpoint
> Media Notes: Import movie or series** and paste a TMDB link.

## Installing a development build

The plugin is not in the community plugin list yet. To try it, build it and
copy it into a vault by hand. Obsidian 1.13 or later is required, on desktop
and mobile alike.

1. Build the plugin (needs Node, for example in the dev container):

   ```sh
   npm install
   npm run build
   ```

   Use `npm run build`, not `npm run dev`: the development build embeds a
   source map, which makes `main.js` much larger, and every synced device has
   to download that larger file.

2. Copy it into your vault. On the machine that holds the vault (no Node
   needed there), run:

   ```sh
   scripts/install-to-vault.sh <path to vault>
   ```

   It copies `main.js` and `manifest.json` to
   `<vault>/.obsidian/plugins/pinpoint-media-notes/`, creating the folder if
   needed, and leaves the plugin's settings (`data.json`) alone. It refuses a
   folder without `.obsidian` and a development build. To do it by hand, copy
   those two files into that folder; its name must be the plugin id.

3. In Obsidian, open **Settings → Community plugins**, turn off
   **Restricted mode** if it is on, reload the plugin list and enable
   **Pinpoint Media Notes**.

4. In the plugin's settings, set **Book notes folder** (for example `Books`).
   The import stops with a message until it is set. The image folder defaults
   to `assets`. Both folders are relative to the vault root.

5. Run **Pinpoint Media Notes: Import book** from the command palette and
   enter an ISBN, a DNB record number or a `d-nb.info` link.

After a new build, run the script again, then turn the plugin off and on or
run **Reload app without saving**.

### Synced vaults and mobile

The plugin has no desktop-only dependencies and is meant to run on iOS and
Android as well; this has not been tested yet.

- **Obsidian Sync** transfers plugins only with **Installed community
  plugins** and **Active community plugin list** turned on in its settings.
  Other sync services (iCloud, Syncthing, …) copy the `.obsidian` folder
  along with the rest of the vault.
- On each device, **Restricted mode** must be off, and the plugin may need
  enabling there too.
- The settings are stored in `data.json` in the plugin folder and sync with
  it. The folders are vault-relative, so they apply on every device.
- Importing the same book on two devices before the sync has finished
  creates the note twice: each device only checks for files it already has.

## Development

```sh
npm install
npm run check   # typecheck, lint, format check, tests, build
npm run dev     # watch build
```

See `AGENTS.md` for architecture and conventions.

## License

MIT
