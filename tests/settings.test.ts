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
		expect([...keys].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
	});
});
