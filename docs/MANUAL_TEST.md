# Manual test in Obsidian

The test suite covers the logic with recorded responses, and the contract
tests (`npm run test:contract`) check the live APIs: input parsing, field
mapping, file names, messages and the per-entry order are all tested there
and are not repeated here. What neither can check is the plugin inside
Obsidian: settings tab, modals, the Vault API, and `requestUrl` on each
platform. This checklist covers only that.

The plugin has been in use on desktop and iOS since autumn 2026, with
well over a hundred books (German and English) and movies imported. The
checklist therefore does not re-check everything for each version:

- **Before a release:** the smoke test, on desktop.
- **Additionally**, the section for each area changed since the last
  release (see `git diff --stat <last tag>`). An area not touched needs no
  check.

Use a test vault, not your real one: the checks create and delete notes.
Record the result at the end.

## Smoke test

Before a release. Set **Book notes folder** to `Books`, **Movie and series
notes folder** to `Movies` and the real token.

- [ ] `npm run build`, then `python3 scripts/install-to-vault.py <test vault>`.
      Reload the plugin: no error in the developer console
      (**Ctrl/Cmd+Shift+I**), both commands in the command palette.
- [ ] Book from the DNB, `9783442178582`: the window closes, the new note
      opens in a new tab with the focus in the editor. The properties view
      shows no errors, and the cover shows.
- [ ] Book from the Library of Congress, `9781492082798`: title (title
      case) and cover from Open Library. This checks that `requestUrl`
      follows Open Library's redirects; if not, the notice reports
      `HTTP 302`.
- [ ] Movie, `https://www.themoviedb.org/movie/800815-the-pale-blue-eye`:
      note and poster created, the note opens.
- [ ] `9783442178582` again: skipped as "already exists"; the window stays
      open and keeps the input.

## Settings tab

When `src/settings.ts` changed.

- [ ] Three groups (Images, Books, Movies and series); settings search
      finds "Cover size" and "TMDB read access token".
- [ ] Folder fields suggest existing folders; `../x` shows an error,
      `Media/Books` does not.
- [ ] The token field is masked, and still filled after reopening the
      settings.
- [ ] Changed settings survive **Reload app without saving**.

## Import window and record picker

When `src/main.ts` or `src/ui/` changed.

- [ ] Empty book notes folder: **Import book** shows a notice naming the
      setting and opens no window.
- [ ] Wrong token (e.g. `eyJwrong`): importing `movie/800815` shows a
      notice about the rejected token and closes the window; the token
      appears neither in the notice nor in the console.
- [ ] Enter while an import runs: the field is disabled, no second import
      starts.
- [ ] An ISBN with several records opens the record picker over the
      window; **Import** on a row imports it, closing the picker skips the
      entry.

## Vault and network

When `src/io/` changed.

- [ ] Import into folders that do not exist yet: notes folder and image
      folder are created.
- [ ] A hand-made note at the target path: the import skips, the note is
      unchanged, no `(1)` copy anywhere.
- [ ] Delete an imported note, keep its image, import again: "Kept the
      existing cover", the image is unchanged.

## Mobile

When `src/ui/` or `src/io/` changed, on iOS (and Android, if available).

- [ ] One book and one movie import with cover.
- [ ] The import window works with the on-screen keyboard; Enter submits.
- [ ] The record picker is usable on a narrow screen (if `src/ui/`
      changed).

## Result

| Date       | Obsidian | Platform | Plugin | Sections run | Failed items |
| ---------- | -------- | -------- | ------ | ------------ | ------------ |
| 2026-10-28 | 1.14.5   | macOS    | 0.1.0  | non-mobile   | none         |
| 2026-10-28 | 1.14.5   | iOS      | 0.1.0  | mobile       | none         |
