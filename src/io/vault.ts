import { normalizePath, type Vault } from "obsidian";

// The only place that writes to the vault. Importers depend on the
// `VaultFiles` interface, so their tests use an in-memory fake.

export interface VaultFiles {
	/** Whether a file or folder exists at the vault-relative path. */
	exists(path: string): Promise<boolean>;
	/** Creates the folder and its parents if missing. */
	ensureFolder(path: string): Promise<void>;
	/** Creates a new note; fails if the path is taken. */
	createNote(path: string, content: string): Promise<void>;
	/** Creates a new binary file; fails if the path is taken. */
	createBinary(path: string, data: ArrayBuffer): Promise<void>;
}

export function vaultFiles(vault: Vault): VaultFiles {
	return {
		// The adapter asks the file system, so a case-insensitive file system
		// reports a clash that the vault's in-memory index would miss.
		exists: (path) => vault.adapter.exists(normalizePath(path)),

		async ensureFolder(path) {
			const folder = normalizePath(path);
			if (await vault.adapter.exists(folder)) return;
			try {
				await vault.createFolder(folder);
			} catch (error) {
				// Lost a race against another creation of the same folder.
				if (!(await vault.adapter.exists(folder))) throw error;
			}
		},

		async createNote(path, content) {
			await vault.create(normalizePath(path), content);
		},

		async createBinary(path, data) {
			await vault.createBinary(normalizePath(path), data);
		},
	};
}
