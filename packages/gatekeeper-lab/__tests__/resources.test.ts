import { describe, expect, it } from "vitest";
import {
  CATALOG_RESOURCE, parseResourceUrl, resourceUrl, REVISIONS_RESOURCE, STUDY_RESOURCE,
} from "../src/resources";

describe("resource URLs", () => {
  it("round-trip through their fixed patterns", () => {
    const revisions = { type: "revisions", kind: "workflow", name: "breakout-2" } as const;
    const study = { type: "study", studyId: "stu_0012" } as const;
    for (const resource of [{ type: "catalog" } as const, revisions, study]) {
      expect(parseResourceUrl(resourceUrl(resource))).toEqual(resource);
    }
    expect(CATALOG_RESOURCE.urlPattern).toBe("https://lab.invalid/revisions");
    expect(REVISIONS_RESOURCE.urlPattern).toBe("https://lab.invalid/revisions/:kind/:name");
    expect(STUDY_RESOURCE.urlPattern).toBe("https://lab.invalid/studies/:studyId");
  });

  it("refuse anything outside the lab or the three shapes", () => {
    for (const url of [
      "https://lab.test/studies/stu_0001",
      "http://lab.invalid/studies/stu_0001",
      "https://lab.invalid/studies/0001",
      "https://lab.invalid/studies/stu_0001/runs",
      "https://lab.invalid/studies/stu_0001?x=1",
      "https://lab.invalid/revisions/study/breakout",
      "https://lab.invalid/revisions/workflow/Breakout",
      "https://lab.invalid/revisions/workflow",
      "https://lab.invalid/revisions/",
      "https://lab.invalid/connections/con_0001",
      "not a url",
    ]) {
      expect(parseResourceUrl(url)).toBeNull();
    }
  });
});
