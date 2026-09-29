import { describe, expect, it } from "vitest";
import { EntryError } from "../../src/core/errors";
import { fields, firstSubfield, parseSruResponse, subfields } from "../../src/book/marc";
import { fixture, marcRecord, sruResponse } from "../helpers";

describe("parseSruResponse", () => {
	it("finds each record once, not once more for its SRU wrapper", () => {
		expect(parseSruResponse(fixture("book/sru-1-prozent-methode.xml"))).toHaveLength(1);
		const records = parseSruResponse(fixture("book/sru-kaenguru-rebellion.xml"));
		expect(records.map((record) => record.control["001"])).toEqual([
			"1379107830",
			"1379188067",
			"139261385X",
			"1392644321",
			"1395073848",
		]);
	});

	it("returns no records for an empty result", () => {
		expect(parseSruResponse(fixture("book/sru-empty.xml"))).toEqual([]);
	});

	it("reads control fields, indicators and repeated subfields", () => {
		const [record] = parseSruResponse(fixture("book/sru-1-prozent-methode.xml"));
		expect(record?.control["001"]).toBe("1198618736");
		const author = fields(record!, "100")[0]!;
		expect(author.ind1).toBe("1");
		expect(subfields(author, "0")).toEqual([
			"(DE-588)1186646756",
			"https://d-nb.info/gnd/1186646756",
			"(DE-101)1186646756",
		]);
	});

	it("strips non-sorting markers, raw or as entity text", () => {
		const [record] = parseSruResponse(fixture("book/sru-1-prozent-methode.xml"));
		expect(firstSubfield(record!, "245", "a")).toBe("Die 1 % Methode");
		const [escaped] = parseSruResponse(
			sruResponse([marcRecord("1", [["245", [["a", "&#152;Das&#156; Tor"]]]])]),
		);
		expect(firstSubfield(escaped!, "245", "a")).toBe("Das Tor");
	});

	it("normalises every value to NFC", () => {
		const decomposed = "Müller, Jürgen";
		const [record] = parseSruResponse(
			sruResponse([marcRecord("1", [["100", [["a", decomposed]]]])]),
		);
		const name = firstSubfield(record!, "100", "a");
		expect(name).toBe("Müller, Jürgen");
		expect(name).toBe(name?.normalize("NFC"));
	});

	it("reports invalid XML as an entry error", () => {
		expect(() => parseSruResponse("<html><body>Wartung")).toThrow(EntryError);
	});

	it("reports an SRU diagnostic", () => {
		const xml =
			`<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><numberOfRecords>0</numberOfRecords>` +
			`<diagnostics><diag:diagnostic xmlns:diag="http://www.loc.gov/zing/srw/diagnostic/">` +
			`<diag:uri>info:srw/diagnostic/1/10</diag:uri><diag:message>Query syntax error</diag:message>` +
			`</diag:diagnostic></diagnostics></searchRetrieveResponse>`;
		expect(() => parseSruResponse(xml)).toThrow(
			"The catalogue reported an error: Query syntax error",
		);
	});
});
