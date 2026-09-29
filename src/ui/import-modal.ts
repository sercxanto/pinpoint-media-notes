import { Modal, Setting, type App, type TextComponent } from "obsidian";

/**
 * What the modal does after an entry: `next` clears the field for the next
 * entry, `retry` keeps the input for correcting a typo, `stop` closes the
 * modal because no entry can succeed until a setting is fixed.
 */
export type SubmitOutcome = "next" | "retry" | "stop";

export interface ImportModalOptions {
	title: string;
	placeholder: string;
	/** Imports one entry; reporting is up to the caller. */
	onSubmit(input: string): Promise<SubmitOutcome>;
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
			const outcome = await this.options.onSubmit(input);
			if (outcome === "next") text.setValue("");
			if (outcome === "stop") this.close();
		} finally {
			this.busy = false;
			text.setDisabled(false);
			text.inputEl.focus();
		}
	}
}
