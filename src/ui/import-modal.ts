import { Modal, Setting, type App, type TextComponent } from "obsidian";

/**
 * What the modal does after an entry: stay open with the input kept, for
 * correcting a typo, or close and then run `afterClose` (opening the new
 * note). Closing without it ends the session because no entry can succeed
 * until a setting is fixed.
 */
export type SubmitOutcome = { close: false } | { close: true; afterClose?: () => Promise<void> };

export interface ImportModalOptions {
	title: string;
	placeholder: string;
	/** Imports one entry; reporting is up to the caller. */
	onSubmit(input: string): Promise<SubmitOutcome>;
}

/**
 * A single text field. Submitting imports one entry; the modal closes after
 * a success and stays open after an error. Closing it ends the session.
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
		let outcome: SubmitOutcome;
		try {
			outcome = await this.options.onSubmit(input);
		} finally {
			this.busy = false;
			text.setDisabled(false);
		}
		if (outcome.close) {
			// Closed first, so the note opens with the modal gone.
			this.close();
			await outcome.afterClose?.();
		} else {
			text.inputEl.focus();
		}
	}
}
