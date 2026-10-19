import { normalizePath, Notice, Plugin } from "obsidian";
import { bookImportConfig, importBook } from "./book/importer";
import { ConfigError, errorMessage, reasonOf } from "./core/errors";
import { httpGet } from "./io/http";
import { vaultFiles } from "./io/vault";
import { DEFAULT_SETTINGS, PinpointSettingTab, type PinpointSettings } from "./settings";
import { importTmdb, tmdbImportConfig } from "./tmdb/importer";
import { ImportModal, type SubmitOutcome } from "./ui/import-modal";
import { RecordPickerModal } from "./ui/record-picker";

/** Result messages run to several sentences; give time to read them. */
const NOTICE_MS = 10_000;

export default class PinpointMediaNotesPlugin extends Plugin {
	override settings: PinpointSettings = { ...DEFAULT_SETTINGS };

	override async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new PinpointSettingTab(this.app, this));
		this.addCommand({
			id: "import-book",
			name: "Import book",
			callback: () => this.openBookImport(),
		});
		this.addCommand({
			id: "import-movie-or-series",
			name: "Import movie or series",
			callback: () => this.openTmdbImport(),
		});
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<PinpointSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...stored };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Checks the settings first, so a configuration problem stops before any input. */
	openBookImport(): void {
		if (!this.configOk(() => bookImportConfig(this.settings))) return;
		new ImportModal(this.app, {
			title: "Import book",
			placeholder: "ISBN, DNB record number or d-nb.info link",
			onSubmit: (input) => this.importBookEntry(input),
		}).open();
	}

	/** Imports one book and reports the outcome. */
	importBookEntry(input: string): Promise<SubmitOutcome> {
		return this.report(() =>
			importBook(input, {
				http: httpGet,
				files: vaultFiles(this.app.vault),
				config: bookImportConfig(this.settings),
				chooseRecord: (records) => new RecordPickerModal(this.app, records).pick(),
			}),
		);
	}

	/** Checks the settings first, so a missing token stops before any input. */
	openTmdbImport(): void {
		if (!this.configOk(() => tmdbImportConfig(this.settings))) return;
		new ImportModal(this.app, {
			title: "Import movie or series",
			placeholder: "https://www.themoviedb.org/movie/…",
			onSubmit: (input) => this.importTmdbEntry(input),
		}).open();
	}

	/** Imports one movie or series and reports the outcome. */
	importTmdbEntry(input: string): Promise<SubmitOutcome> {
		return this.report(() =>
			importTmdb(input, {
				http: httpGet,
				files: vaultFiles(this.app.vault),
				config: tmdbImportConfig(this.settings),
			}),
		);
	}

	private configOk(check: () => unknown): boolean {
		try {
			check();
			return true;
		} catch (error) {
			new Notice(errorMessage(error), NOTICE_MS);
			return false;
		}
	}

	/**
	 * Shows the result or the error. A success closes the modal and opens the
	 * new note; a configuration problem (such as a token TMDB rejects) closes
	 * it too, since no further entry could succeed.
	 */
	private async report(
		run: () => Promise<{ notePath: string; message: string }>,
	): Promise<SubmitOutcome> {
		try {
			const result = await run();
			new Notice(result.message, NOTICE_MS);
			return { close: true, afterClose: () => this.openNote(result.notePath) };
		} catch (error) {
			new Notice(errorMessage(error), NOTICE_MS);
			return { close: error instanceof ConfigError };
		}
	}

	/** Opens the note in a new tab, so the note shown before stays open. */
	async openNote(path: string): Promise<void> {
		try {
			const file = this.app.vault.getFileByPath(normalizePath(path));
			if (!file) throw new Error("not found in the vault");
			await this.app.workspace.getLeaf("tab").openFile(file);
		} catch (error) {
			new Notice(`Could not open "${path}": ${reasonOf(error)}`, NOTICE_MS);
		}
	}
}
