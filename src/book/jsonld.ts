import { nfc } from "../core/text";

/**
 * A JSON-LD document in expanded flat form, as `id.loc.gov` serves it: an
 * array of nodes, each with an `@id`, linked to each other by `@id`. Blank
 * nodes (`_:b…`) are nodes like any other.
 */
export class JsonLdGraph {
	private readonly nodes = new Map<string, JsonLdNode>();

	private constructor(nodes: JsonLdNode[]) {
		for (const node of nodes) this.nodes.set(node.id, node);
	}

	/** Null if the text is not JSON or not an array of nodes with an `@id`. */
	static parse(text: string): JsonLdGraph | null {
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch {
			return null;
		}
		if (!Array.isArray(data)) return null;
		const nodes: JsonLdNode[] = [];
		for (const item of data) {
			if (!isObject(item) || typeof item["@id"] !== "string") return null;
			nodes.push(new JsonLdNode(item["@id"], item));
		}
		return new JsonLdGraph(nodes);
	}

	node(id: string): JsonLdNode | undefined {
		return this.nodes.get(id);
	}

	/**
	 * The nodes a property links to, in document order. A link to a node the
	 * document does not hold (a vocabulary term like a relator) still gives a
	 * node, with its `@id` and nothing else.
	 */
	links(node: JsonLdNode, property: string): JsonLdNode[] {
		return node
			.objects(property)
			.map((object) => object["@id"])
			.filter((id): id is string => typeof id === "string")
			.map((id) => this.nodes.get(id) ?? new JsonLdNode(id, {}));
	}
}

export class JsonLdNode {
	constructor(
		readonly id: string,
		private readonly raw: Record<string, unknown>,
	) {}

	hasType(type: string): boolean {
		const types = this.raw["@type"];
		return Array.isArray(types) && types.includes(type);
	}

	/** The property's literal values, NFC-normalised and trimmed; empty ones dropped. */
	values(property: string): string[] {
		return this.objects(property)
			.map((object) => object["@value"])
			.filter((value): value is string => typeof value === "string")
			.map((value) => nfc(value).trim())
			.filter((value) => value !== "");
	}

	objects(property: string): Record<string, unknown>[] {
		const objects = this.raw[property];
		return Array.isArray(objects) ? objects.filter(isObject) : [];
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
