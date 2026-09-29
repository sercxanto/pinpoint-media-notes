import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, PinpointSettingTab, type PinpointSettings } from "./settings";

export default class PinpointMediaNotesPlugin extends Plugin {
	override settings: PinpointSettings = { ...DEFAULT_SETTINGS };

	override async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new PinpointSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<PinpointSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...stored };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
