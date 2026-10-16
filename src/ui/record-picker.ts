import { Modal, Setting, type App } from "obsidian";
import { describeRecord, type BookRecord } from "../book/record";

/**
 * Lists the records a lookup returned and lets the user choose one. Closing
 * the modal without a choice skips the entry; nothing is guessed.
 */
export class RecordPickerModal<T extends BookRecord> extends Modal {
	private chosen: T | null = null;
	private resolve: ((book: T | null) => void) | undefined;

	constructor(
		app: App,
		private readonly records: T[],
	) {
		super(app);
	}

	/** Opens the modal; resolves to the chosen record, or null when closed without a choice. */
	pick(): Promise<T | null> {
		const choice = new Promise<T | null>((resolve) => (this.resolve = resolve));
		this.open();
		return choice;
	}

	choose(book: T): void {
		this.chosen ??= book;
		this.close();
	}

	override onOpen(): void {
		this.setTitle("Several catalogue records match");
		this.contentEl.createEl("p", {
			text: "Choose the edition to import, or close this window to skip the entry.",
		});
		let first: HTMLButtonElement | undefined;
		for (const book of this.records) {
			const { name, details } = describeRecord(book);
			new Setting(this.contentEl)
				.setName(name)
				.setDesc(details)
				.addButton((button) => {
					first ??= button.buttonEl;
					button.setButtonText("Import").onClick(() => this.choose(book));
				});
		}
		first?.focus();
	}

	override onClose(): void {
		this.contentEl.empty();
		this.resolve?.(this.chosen);
		this.resolve = undefined;
	}
}
