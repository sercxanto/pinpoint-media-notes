import { App, type SettingDefinition, type SettingDefinitionItem } from "obsidian";
import { describe, expect, it } from "vitest";
import PinpointMediaNotesPlugin from "../src/main";
import { DEFAULT_SETTINGS, PinpointSettingTab } from "../src/settings";

function controlKeys(items: SettingDefinitionItem[]): string[] {
	return items.flatMap((item) => {
		if ("items" in item) return controlKeys(item.items ?? []);
		const control = (item as SettingDefinition).control;
		return control ? [control.key] : [];
	});
}

function findItem(items: SettingDefinitionItem[], name: string): SettingDefinitionItem | undefined {
	for (const item of items) {
		if ("items" in item) {
			const found = findItem(item.items ?? [], name);
			if (found) return found;
		} else if ("name" in item && item.name === name) return item;
	}
	return undefined;
}

async function loadPlugin(stored: unknown): Promise<PinpointMediaNotesPlugin> {
	const plugin = new PinpointMediaNotesPlugin(new App(), {} as never);
	(plugin as unknown as { data: unknown }).data = stored;
	await plugin.onload();
	return plugin;
}

describe("settings", () => {
	it("uses the documented defaults when nothing is stored", async () => {
		const plugin = await loadPlugin(null);
		expect(plugin.settings).toEqual({
			bookNotesDir: "",
			tmdbNotesDir: "",
			assetsDir: "assets",
			coverSize: "l",
			tmdbToken: "",
			tmdbLanguage: "en-US",
			posterSize: "w500",
		});
	});

	it("keeps stored values and fills missing ones from the defaults", async () => {
		const plugin = await loadPlugin({ bookNotesDir: "Books", tmdbLanguage: "de-DE" });
		expect(plugin.settings).toEqual({
			...DEFAULT_SETTINGS,
			bookNotesDir: "Books",
			tmdbLanguage: "de-DE",
		});
	});

	it("offers a control for every setting and for nothing else", () => {
		const tab = new PinpointSettingTab(new App(), {} as never);
		const keys = controlKeys(tab.getSettingDefinitions());
		// The token row is rendered by hand, see below.
		expect([...keys, "tmdbToken"].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
	});

	it("renders the token as a masked field that saves the trimmed value", async () => {
		const plugin = await loadPlugin({ tmdbToken: "stored-token" });
		const tab = new PinpointSettingTab(plugin.app, plugin);
		const item = findItem(tab.getSettingDefinitions(), "TMDB read access token");
		expect(item && "render" in item).toBe(true);

		const input = { type: "text", autocomplete: "on", spellcheck: true };
		let changed: ((value: string) => unknown) | undefined;
		let shown = "";
		const text = {
			inputEl: input,
			setValue: (value: string) => ((shown = value), text),
			onChange: (callback: (value: string) => unknown) => ((changed = callback), text),
		};
		const setting = {
			setName: () => setting,
			setDesc: () => setting,
			addText: (build: (component: typeof text) => void) => (build(text), setting),
		};
		(item as { render: (setting: unknown) => void }).render(setting);

		expect(input.type).toBe("password");
		expect(shown).toBe("stored-token");
		changed?.("  new-token \n");
		await Promise.resolve();
		expect(plugin.settings.tmdbToken).toBe("new-token");
		expect((plugin as unknown as { data: { tmdbToken: string } }).data.tmdbToken).toBe(
			"new-token",
		);
	});
});
