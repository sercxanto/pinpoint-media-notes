import { Notice, Plugin } from "obsidian";
import { bookImportConfig, importBook, refuseSeveralRecords } from "./book/importer";
import { errorMessage } from "./core/errors";
import { httpGet } from "./io/http";
import { vaultFiles } from "./io/vault";
import { DEFAULT_SETTINGS, PinpointSettingTab, type PinpointSettings } from "./settings";
import { ImportModal } from "./ui/import-modal";

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
		try {
			bookImportConfig(this.settings);
		} catch (error) {
			new Notice(errorMessage(error), NOTICE_MS);
			return;
		}
		new ImportModal(this.app, {
			title: "Import book",
			placeholder: "ISBN, DNB record number or d-nb.info link",
			onSubmit: (input) => this.importBookEntry(input),
		}).open();
	}

	/** Imports one entry and reports the outcome. Resolves to whether it succeeded. */
	async importBookEntry(input: string): Promise<boolean> {
		try {
			const result = await importBook(input, {
				http: httpGet,
				files: vaultFiles(this.app.vault),
				config: bookImportConfig(this.settings),
				chooseRecord: refuseSeveralRecords,
			});
			new Notice(result.message, NOTICE_MS);
			return true;
		} catch (error) {
			new Notice(errorMessage(error), NOTICE_MS);
			return false;
		}
	}
}
