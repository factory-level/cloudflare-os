import { describe, expect, it } from "vitest";
import { parseResourceUrl, resourceUrl, revisionsResource, studyResource } from "../src/resources";

const LAB = "https://lab.test/api";

describe("resource URLs", () => {
  it("round-trip through their patterns", () => {
    const revisions = { type: "revisions", kind: "workflow", name: "breakout-2" } as const;
    const study = { type: "study", studyId: "stu_0012" } as const;
    expect(parseResourceUrl(LAB, resourceUrl(LAB, revisions))).toEqual(revisions);
    expect(parseResourceUrl(LAB, resourceUrl(LAB, study))).toEqual(study);
    expect(revisionsResource(LAB).urlPattern).toBe("https://lab.test/api/revisions/:kind/:name");
    expect(studyResource(LAB).urlPattern).toBe("https://lab.test/api/studies/:studyId");
  });

  it("refuse anything outside the lab or the two shapes", () => {
    for (const url of [
      "https://other.test/api/studies/stu_0001",
      "https://lab.test/studies/stu_0001",
      "https://lab.test/api/studies/0001",
      "https://lab.test/api/studies/stu_0001/runs",
      "https://lab.test/api/studies/stu_0001?x=1",
      "https://lab.test/api/revisions/study/breakout",
      "https://lab.test/api/revisions/workflow/Breakout",
      "https://lab.test/api/revisions/workflow",
      "https://lab.test/api/connections/con_0001",
      "not a url",
    ]) {
      expect(parseResourceUrl(LAB, url)).toBeNull();
    }
  });
});
