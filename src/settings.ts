import { PluginSettingTab, type App, type Setting, type SettingDefinitionItem } from "obsidian";
import { validateFolderInput } from "./core/paths";
import type PinpointMediaNotesPlugin from "./main";

export interface PinpointSettings {
	/** Vault-relative folder for book notes. Required, no default. */
	bookNotesDir: string;
	/** Vault-relative folder for movie and series notes. Required, no default. */
	tmdbNotesDir: string;
	/** Vault-relative folder for covers and posters of both importers. */
	assetsDir: string;
	/** DNB cover size: s (90×122), m (200×272) or l (442×599). */
	coverSize: CoverSize;
	/** TMDB API Read Access Token. Never log or display it. */
	tmdbToken: string;
	/** TMDB locale, e.g. de-DE. */
	tmdbLanguage: string;
	/** TMDB image size token, e.g. w500 or original. */
	posterSize: string;
}

export type CoverSize = "s" | "m" | "l";

export const DEFAULT_SETTINGS: PinpointSettings = {
	bookNotesDir: "",
	tmdbNotesDir: "",
	assetsDir: "assets",
	coverSize: "l",
	tmdbToken: "",
	tmdbLanguage: "en-US",
	posterSize: "w500",
};

/**
 * The names the settings tab shows; messages about a setting quote them, so
 * the user finds it.
 */
export const SETTING_NAMES = {
	assetsDir: "Image folder",
	bookNotesDir: "Book notes folder",
	coverSize: "Cover size",
	tmdbNotesDir: "Movie and series notes folder",
	tmdbToken: "TMDB read access token",
	tmdbLanguage: "Language",
	posterSize: "Poster size",
} as const satisfies Record<keyof PinpointSettings, string>;

const POSTER_SIZES = ["w92", "w154", "w185", "w342", "w500", "w780", "original"];

const TOKEN_DESC =
	"The long API read access token from your TMDB account settings, not the short API key. Stored in the plugin's data.json, like all settings.";

export class PinpointSettingTab extends PluginSettingTab {
	constructor(app: App, plugin: PinpointMediaNotesPlugin) {
		super(app, plugin);
	}

	override getSettingDefinitions(): SettingDefinitionItem<keyof PinpointSettings>[] {
		return [
			{
				type: "group",
				heading: "Images",
				items: [
					{
						name: SETTING_NAMES.assetsDir,
						desc: "Vault-relative folder for covers and posters.",
						control: {
							type: "folder",
							key: "assetsDir",
							defaultValue: DEFAULT_SETTINGS.assetsDir,
							validate: validateFolderInput,
						},
					},
				],
			},
			{
				type: "group",
				heading: "Books",
				items: [
					{
						name: SETTING_NAMES.bookNotesDir,
						desc: "Vault-relative folder for book, e-book and audiobook notes.",
						control: {
							type: "folder",
							key: "bookNotesDir",
							validate: validateFolderInput,
						},
					},
					{
						name: SETTING_NAMES.coverSize,
						control: {
							type: "dropdown",
							key: "coverSize",
							defaultValue: DEFAULT_SETTINGS.coverSize,
							options: {
								s: "Small (90×122)",
								m: "Medium (200×272)",
								l: "Large (442×599)",
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: "Movies and series",
				items: [
					{
						name: SETTING_NAMES.tmdbNotesDir,
						desc: "Vault-relative folder for movie and series notes.",
						control: {
							type: "folder",
							key: "tmdbNotesDir",
							validate: validateFolderInput,
						},
					},
					{
						name: SETTING_NAMES.tmdbToken,
						desc: TOKEN_DESC,
						render: (setting) => this.renderTokenField(setting),
					},
					{
						name: SETTING_NAMES.tmdbLanguage,
						desc: "TMDB locale for titles, descriptions and posters, e.g. de-DE.",
						control: {
							type: "text",
							key: "tmdbLanguage",
							defaultValue: DEFAULT_SETTINGS.tmdbLanguage,
						},
					},
					{
						name: SETTING_NAMES.posterSize,
						control: {
							type: "dropdown",
							key: "posterSize",
							defaultValue: DEFAULT_SETTINGS.posterSize,
							options: Object.fromEntries(POSTER_SIZES.map((size) => [size, size])),
						},
					},
				],
			},
		];
	}

	/**
	 * A masked text field. The declarative `text` control shows its value in
	 * clear, so this row is rendered by hand, over the same value accessors.
	 */
	renderTokenField(setting: Setting): void {
		setting.setName(SETTING_NAMES.tmdbToken).setDesc(TOKEN_DESC);
		setting.addText((text) => {
			text.inputEl.type = "password";
			text.inputEl.autocomplete = "off";
			text.inputEl.spellcheck = false;
			const stored = this.getControlValue("tmdbToken");
			text.setValue(typeof stored === "string" ? stored : "");
			text.onChange((value) => {
				void this.setControlValue("tmdbToken", value.trim());
			});
		});
	}
}
