import { PluginSettingTab, type App, type SettingDefinitionItem } from "obsidian";
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

const POSTER_SIZES = ["w92", "w154", "w185", "w342", "w500", "w780", "original"];

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
						name: "Image folder",
						desc: "Vault-relative folder for covers and posters.",
						control: {
							type: "folder",
							key: "assetsDir",
							defaultValue: "assets",
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
						name: "Book notes folder",
						desc: "Vault-relative folder for book, e-book and audiobook notes.",
						control: {
							type: "folder",
							key: "bookNotesDir",
							validate: validateFolderInput,
						},
					},
					{
						name: "Cover size",
						control: {
							type: "dropdown",
							key: "coverSize",
							defaultValue: "l",
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
						name: "Movie and series notes folder",
						desc: "Vault-relative folder for movie and series notes.",
						control: {
							type: "folder",
							key: "tmdbNotesDir",
							validate: validateFolderInput,
						},
					},
					{
						name: "TMDB read access token",
						desc: "The long API read access token from your TMDB account settings, not the short API key.",
						control: { type: "text", key: "tmdbToken" },
					},
					{
						name: "Language",
						desc: "TMDB locale for titles, descriptions and posters, e.g. de-DE.",
						control: { type: "text", key: "tmdbLanguage", defaultValue: "en-US" },
					},
					{
						name: "Poster size",
						control: {
							type: "dropdown",
							key: "posterSize",
							defaultValue: "w500",
							options: Object.fromEntries(POSTER_SIZES.map((size) => [size, size])),
						},
					},
				],
			},
		];
	}
}
