import { describe, expect, test } from "bun:test";
import {
  parseEntities, matchEntities, sliceBody, scopeLabel, type SemEntity,
} from "@/domain/entities.ts";

/** Real-shape `sem entities --json` fixture (customers.handler.ts excerpt). */
const RAW = JSON.stringify([
  { name: "CustomerNode", type: "type", start_line: 9, end_line: 9, parent_id: null },
  { name: "CustomersHandler", type: "class", start_line: 26, end_line: 318, parent_id: null },
  {
    name: "getGraphQLQuery", type: "method", start_line: 32, end_line: 34,
    parent_id: "src/handlers/customerSyncHandler/customers.handler.ts::class::CustomersHandler",
  },
  { name: "Backend Template", type: "heading", start_line: 1, end_line: 3, parent_id: null },
]);

describe("parseEntities", () => {
  test("maps the sem entities JSON to typed entities", () => {
    const ents = parseEntities(RAW);
    expect(ents).toContainEqual({
      file: "", name: "getGraphQLQuery", type: "method", startLine: 32, endLine: 34,
      parentId: "src/handlers/customerSyncHandler/customers.handler.ts::class::CustomersHandler",
    });
    expect(ents).toHaveLength(4);
  });

  test("returns [] on malformed input", () => {
    expect(parseEntities("not json")).toEqual([]);
    expect(parseEntities("{}")).toEqual([]);
  });
});

describe("matchEntities", () => {
  const ents: SemEntity[] = parseEntities(RAW);
  test("keeps entities whose name matches exactly, dropping headings", () => {
    expect(matchEntities(ents, "getGraphQLQuery").map((e) => e.name)).toEqual(["getGraphQLQuery"]);
    expect(matchEntities(ents, "Backend Template")).toEqual([]); // heading excluded
    expect(matchEntities(ents, "getGraphQL")).toEqual([]); // no partial match
  });
});

describe("sliceBody", () => {
  const lines = ["l1", "", "  def foo()", "  body", "  end", "l6"];
  test("returns the inclusive 1-based range and first non-empty line", () => {
    expect(sliceBody(lines, 3, 5)).toEqual({ body: "  def foo()\n  body\n  end", matched: "  def foo()" });
  });
  test("clamps out-of-range bounds", () => {
    expect(sliceBody(lines, 5, 999)).toEqual({ body: "  end\nl6", matched: "  end" });
  });
});

describe("scopeLabel", () => {
  /** [label, parentId, name, expected] */
  const CASES: Array<[string, string | null, string, string]> = [
    ["top-level entity → bare name", null, "classifyState", "classifyState"],
    ["method → Class.method", "a/b.ts::class::CustomersHandler", "getGraphQLQuery", "CustomersHandler.getGraphQLQuery"],
    ["nested id → nearest parent", "a/b.ts::class::Outer::method::inner", "leaf", "inner.leaf"],
  ];
  test.each(CASES)("%s", (_l, parentId, name, expected) => {
    expect(scopeLabel(parentId, name)).toBe(expected);
  });
});
