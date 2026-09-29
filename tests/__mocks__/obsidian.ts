// Hand-written fake of the parts of the `obsidian` API this plugin uses.
// The real package ships type definitions only. Keep this file as small as
// the plugin's actual usage and extend it only when production code starts
// using something new.

import type { Command, RequestUrlParam, RequestUrlResponse, SettingDefinitionItem } from "obsidian";

/** Every `new Notice(...)` lands here so tests can assert on user messages. */
export const notices: string[] = [];

export class Notice {
	constructor(message: string | DocumentFragment, _duration?: number) {
		notices.push(typeof message === "string" ? message : (message.textContent ?? ""));
	}
}

export function normalizePath(path: string): string {
	return path
		.replace(/[\\/]+/g, "/")
		.replace(/^\/|\/$/g, "")
		.normalize("NFC");
}

/** Tests install a handler; every call is also recorded. */
export const http = {
	calls: [] as RequestUrlParam[],
	handler: (request: RequestUrlParam): RequestUrlResponse => {
		throw new Error(`No HTTP handler installed for ${request.url}`);
	},
};

export function requestUrl(request: RequestUrlParam): Promise<RequestUrlResponse> {
	http.calls.push(request);
	try {
		return Promise.resolve(http.handler(request));
	} catch (error) {
		return Promise.reject(error instanceof Error ? error : new Error(String(error)));
	}
}

/** In-memory vault: paths of folders, and files with their content. */
export class Vault {
	folders = new Set<string>();
	files = new Map<string, string | ArrayBuffer>();

	adapter = {
		exists: (path: string): Promise<boolean> =>
			Promise.resolve(this.files.has(path) || this.folders.has(path)),
	};

	createFolder(path: string): Promise<void> {
		if (this.folders.has(path)) return Promise.reject(new Error("Folder already exists."));
		const parts = path.split("/");
		parts.forEach((_, i) => this.folders.add(parts.slice(0, i + 1).join("/")));
		return Promise.resolve();
	}

	create(path: string, data: string): Promise<void> {
		return this.add(path, data);
	}

	createBinary(path: string, data: ArrayBuffer): Promise<void> {
		return this.add(path, data);
	}

	private add(path: string, data: string | ArrayBuffer): Promise<void> {
		if (this.files.has(path)) return Promise.reject(new Error("File already exists."));
		this.files.set(path, data);
		return Promise.resolve();
	}
}

export class App {
	vault = new Vault();
}

export class Plugin {
	app: App;
	/** What `saveData` last wrote and `loadData` returns. */
	data: unknown = null;
	settingTabs: PluginSettingTab[] = [];
	commands: Command[] = [];

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

	addCommand(command: Command): Command {
		this.commands.push(command);
		return command;
	}
}

/**
 * Records whether it is open. `open` does not call `onOpen`: the UI itself is
 * not rendered in tests. `close` calls `onClose`, as Obsidian does.
 */
export class Modal {
	app: App;
	isOpen = false;
	contentEl = { empty: (): void => undefined };

	constructor(app: App) {
		this.app = app;
	}

	open(): void {
		this.isOpen = true;
	}

	close(): void {
		this.isOpen = false;
		this.onClose();
	}

	onClose(): void {}
}

/** Referenced by the import modal's `onOpen`, which tests do not render. */
export class Setting {}

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

	/** Reads from `plugin.settings`, as Obsidian's default does. */
	getControlValue(key: string): unknown {
		return this.settings()[key];
	}

	/** Mutates and persists `plugin.settings`, as Obsidian's default does. */
	setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.settings();
		settings[key] = value;
		return this.plugin.saveData(settings);
	}

	private settings(): Record<string, unknown> {
		return (this.plugin as unknown as { settings: Record<string, unknown> }).settings;
	}
}
