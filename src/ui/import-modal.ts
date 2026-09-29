import { Modal, Setting, type App, type TextComponent } from "obsidian";

export interface ImportModalOptions {
	title: string;
	placeholder: string;
	/**
	 * Imports one entry; reporting is up to the caller. Resolves to true when
	 * the field should be cleared for the next entry, false to keep the input
	 * for correcting a typo.
	 */
	onSubmit(input: string): Promise<boolean>;
}

/**
 * A single text field. Submitting imports one entry; the modal stays open,
 * cleared, for the next one. Closing it ends the session.
 */
export class ImportModal extends Modal {
	private busy = false;

	constructor(
		app: App,
		private readonly options: ImportModalOptions,
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle(this.options.title);
		let text: TextComponent | undefined;
		new Setting(this.contentEl)
			.addText((component) => {
				text = component;
				component.setPlaceholder(this.options.placeholder);
				component.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter" && !event.isComposing) {
						event.preventDefault();
						void this.submit(component);
					}
				});
			})
			.addButton((button) =>
				button
					.setButtonText("Import")
					.setCta()
					.onClick(() => {
						if (text) void this.submit(text);
					}),
			);
		text?.inputEl.focus();
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private async submit(text: TextComponent): Promise<void> {
		const input = text.getValue().trim();
		if (input === "" || this.busy) return;
		this.busy = true;
		text.setDisabled(true);
		try {
			if (await this.options.onSubmit(input)) text.setValue("");
		} finally {
			this.busy = false;
			text.setDisabled(false);
			text.inputEl.focus();
		}
	}
}
