# Manual test in Obsidian

The test suite covers the logic with recorded responses, and the contract
tests (`npm run test:contract`) check the live APIs. What neither can check is
the plugin inside Obsidian: settings tab, modals, notices, the Vault API, and
`requestUrl` on each platform. This checklist covers that.

Run it before a release, and after changes to `src/main.ts`, `src/settings.ts`,
`src/ui/` or `src/io/`. Use a test vault, not your real one: the checklist
creates and deletes notes.

Record the result at the end: date, Obsidian version, platform, plugin
version, and every item that failed.

## Setup

- [ ] `npm run build`, then `scripts/install-to-vault.sh <test vault>`.
- [ ] Enable the plugin. No error in the developer console
      (**Ctrl/Cmd+Shift+I** on desktop).
- [ ] The command palette lists **Pinpoint Media Notes: Import book** and
      **Pinpoint Media Notes: Import movie or series**.

## Settings

- [ ] The settings tab shows three groups: Images, Books, Movies and series.
      Image folder is `assets`, cover size _Large_, language `en-US`, poster
      size `w500`.
- [ ] Settings search (the search field at the top of **Settings**) finds
      "Cover size" and "TMDB read access token".
- [ ] Folder fields suggest existing folders.
- [ ] Folder validation: `/abs`, `C:\x`, `../x`, `.` and `/` each show an
      error; `Books`, `Media/Books` and an empty field do not.
- [ ] The token field is masked. After closing and reopening the settings
      the value is still there, still masked.
- [ ] Settings survive **Reload app without saving**.

## Configuration errors

Leave the book notes folder and the token empty for these.

- [ ] **Import book** shows a notice naming _Book notes folder_ and opens no
      window.
- [ ] **Import movie or series** shows a notice naming _TMDB read access
      token_ and opens no window.
- [ ] Token set to a 32-character hex value (e.g.
      `0123456789abcdef0123456789abcdef`): the notice says it looks like the
      API key. The value does not appear in the notice.
- [ ] Token set to a wrong JWT-like value (e.g. `eyJwrong`): the window
      opens; importing `movie/800815` shows a notice about the rejected
      token and closes the window. The token does not appear in the notice
      or in the developer console.

Now set **Book notes folder** to `Books`, **Movie and series notes folder**
to `Movies` and the real token. `Books`, `Movies` and `assets` should not
exist yet.

## Book import

- [ ] `978-3-442-17858-2`: creates `Books/Die 1 % Methode (2020).md` and
      `assets/Die 1 % Methode (2020).jpg`; both folders are created. The
      notice says "Cover from ISBN 9783442178582."
- [ ] The note's properties show in the properties view without errors:
      `year` as a number, `isbn` as text, `authors` and `tags` as lists,
      `genres` as an empty list, `description` filled.
- [ ] The cover link resolves: hovering or opening `cover` shows the image.
- [ ] The window closes and the new note opens in a new tab; the tab
      active before keeps its note. The editor has the focus.
- [ ] `9783442178582` again: skipped, "already exists"; the window stays
      open and the field keeps the input. No new file in `assets`.
- [ ] Delete the note, keep the image, import again: notice "Kept the
      existing cover". The image's modification time is unchanged.
- [ ] `3442178584` (ISBN-10 of the same book, after deleting the note):
      notice "Read 3442178584 as ISBN 9783442178582."
- [ ] `139261385X` (DNB record number of the _Känguru-Rebellion_ e-book):
      notice "Read 139261385X as a DNB record number."; file name ends in
      ` - E-Book.md`; `series` and `series_index` filled.
- [ ] The same e-book's cover: if it came from another edition, the notice
      says "another edition; its artwork may differ".
- [ ] `https://d-nb.info/1379107830` (audio CD): file name ends in
      ` - Hörbuch.md`, `type: audiobook`, only authors in `authors` (no
      narrator).
- [ ] `9783442178583` (wrong check digit): "wrong check digit" at once,
      nothing new in the vault.
- [ ] `9780000000002` (valid, in no catalogue): "No catalogue record for
      ISBN 9780000000002, neither at the DNB nor at the Library of
      Congress."
- [ ] `https://d-nb.info/gnd/118540238` (authority record): rejected.
- [ ] Enter while an import runs: the field is disabled; a second Enter
      starts no second import.
- [ ] Several records: an ISBN shared by print and e-book edition opens the
      record picker over the import window, one row per record. **Import**
      on a row imports that record; closing the picker skips the entry with
      "no record chosen". (Find such an ISBN in the catalogue first; if none
      is at hand, note the item as not run.)

## Book import: Library of Congress fallback

Checked on 2026-10-16: none of these ISBNs is in the DNB.

- [ ] `9781492082798` (_Software engineering at Google_), cover size `l`:
      creates `Books/Software Engineering at Google (2020).md` (title case,
      from Open Library) and its image. The notice says "Not in the DNB;
      record from the Library of Congress. Title from Open Library. Cover
      from Open Library, ISBN 9781492082798." This checks that `requestUrl`
      follows Open Library's redirects: to `/books/…json` for the title, and
      on to `archive.org` for the cover. If it does not, the notice says
      "Title from the Library of Congress: Open Library answered with HTTP
      302" and "No cover: … HTTP 302 …"; report that.
- [ ] The note: `url` is `https://lccn.loc.gov/2021443590` and opens the LoC
      record; three authors; `description` empty.
- [ ] `9781982167400` (_Building a second brain_, e-book): file name ends in
      ` - E-Book.md`; `description` filled, without quotes or "Provided by
      publisher"; the notice says "Cover from Open Library, ISBN
      9781982167387, another edition; its artwork may differ."
- [ ] `9781399615310` (in neither catalogue): "No catalogue record for ISBN
      9781399615310, neither at the DNB nor at the Library of Congress."
      Nothing new in the vault.
- [ ] `1492082791` (ISBN-10 of _Software engineering at Google_, after
      deleting the note): the notice starts "Read 1492082791 as ISBN 9781492082798. Not in the DNB; record from the Library of Congress."

## Movie and series import

Language `de-DE`.

- [ ] `https://www.themoviedb.org/movie/800815-official-competition`:
      creates `Movies/Der beste Film aller Zeiten (2021).md` (or the current
      German title) and the poster in `assets`; `url` is
      `https://www.themoviedb.org/movie/800815`, `imdb_id` filled, `genres`
      in German.
- [ ] `tv/1396`: `type: series`, `imdb_id` filled (from the second request).
- [ ] An entry without German overview: the notice names the fields taken
      from TMDB's default language; the title stays German if TMDB has one.
- [ ] The same link again: skipped, "already exists".
- [ ] `800815` alone: refused as a bare number.
- [ ] `https://example.com/movie/1`: refused as not a TMDB link.
- [ ] `movie/999999999`: a per-entry error; the window stays open.
- [ ] A successful import closes the window and opens the new note.
- [ ] Poster size `original`: the poster is downloaded at full size.

## Name clash and file names

- [ ] Create `Books/Die 1 % Methode (2020).md` by hand with other content,
      import `9783442178582`: skipped, the hand-made note unchanged, no
      `(1)` copy anywhere.
- [ ] A title with a colon, for example `movie/11` (_Star Wars: Episode
      IV …_; any title with a colon will do): the file name lacks the colon,
      `title` keeps it, and the `cover` link resolves.

## Mobile

On iOS and Android, if available, after syncing the plugin:

- [ ] The plugin loads; both commands are in the command palette.
- [ ] One book and one movie import with cover; the cover shows in the note.
- [ ] `9781492082798` imports with title and cover from Open Library (the
      redirects are followed on mobile too).
- [ ] The import window is usable with the on-screen keyboard; Enter
      submits.
- [ ] The record picker is usable on a narrow screen.

## Result

| Date | Obsidian | Platform | Plugin | Failed items |
| ---- | -------- | -------- | ------ | ------------ |
|      |          |          |        |              |
