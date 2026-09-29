// Hand-written fake of the parts of the `obsidian` API this plugin uses.
// The real package ships type definitions only. Keep this file as small as
// the plugin's actual usage and extend it only when production code starts
// using something new.

import type { SettingDefinitionItem } from "obsidian";

/** Every `new Notice(...)` lands here so tests can assert on user messages. */
export const notices: string[] = [];

export class Notice {
	constructor(message: string | DocumentFragment) {
		notices.push(typeof message === "string" ? message : (message.textContent ?? ""));
	}
}

export class App {
	vault = {};
}

export class Plugin {
	app: App;
	/** What `saveData` last wrote and `loadData` returns. */
	data: unknown = null;
	settingTabs: PluginSettingTab[] = [];

	constructor(app: App) {
		this.app = app;
	}

	loadData(): Promise<unknown> {
		return Promise.resolve(this.data);
	}

	saveData(data: unknown): Promise<void> {
		this.data = structuredClone(data);
		return Promise.resolve();
	}

	addSettingTab(tab: PluginSettingTab): void {
		this.settingTabs.push(tab);
	}
}

export class PluginSettingTab {
	app: App;
	plugin: Plugin;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [];
	}
}
