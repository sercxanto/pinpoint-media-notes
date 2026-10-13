import { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { parseSruResponse } from "../../src/book/marc";
import { readDnbRecord } from "../../src/book/dnb-record";
import { RecordPickerModal } from "../../src/ui/record-picker";
import { fixture } from "../helpers";

const records = parseSruResponse(fixture("book/sru-kaenguru-rebellion.xml")).map(readDnbRecord);

describe("RecordPickerModal", () => {
	it("resolves to the chosen record and closes", async () => {
		const modal = new RecordPickerModal(new App(), records);
		const choice = modal.pick();
		expect((modal as unknown as { isOpen: boolean }).isOpen).toBe(true);
		modal.choose(records[2]!);
		expect(await choice).toBe(records[2]);
		expect((modal as unknown as { isOpen: boolean }).isOpen).toBe(false);
	});

	it("resolves to null when closed without a choice", async () => {
		const modal = new RecordPickerModal(new App(), records);
		const choice = modal.pick();
		modal.close();
		expect(await choice).toBeNull();
	});
});
