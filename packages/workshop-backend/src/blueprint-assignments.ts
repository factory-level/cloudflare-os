import type { BlueprintBinding, BlueprintBindingAssignment } from "@gadgets/workshop-shared/api";

/**
 * Check binding assignments for newGadgetFromBlueprint against the blueprint's bindings, so bad
 * input is rejected before any workspace exists. Every blueprint binding is required, each
 * assignment must name one of them, and each must match that binding's type. Throws one error
 * listing every problem.
 */
export function checkBlueprintAssignments(
    blueprintBindings: Record<string, BlueprintBinding>,
    assignments: Record<string, BlueprintBindingAssignment>): void {
  let problems: string[] = [];

  // Object.hasOwn rather than `in` or indexing, so names like "toString" or "__proto__" can't
  // resolve through the prototype chain.
  let unknown = Object.keys(assignments).filter(name => !Object.hasOwn(blueprintBindings, name));
  if (unknown.length > 0) {
    problems.push(`unknown binding${unknown.length > 1 ? "s" : ""} ${quoteList(unknown)}`);
  }

  let missing = Object.keys(blueprintBindings).filter(name => !Object.hasOwn(assignments, name));
  if (missing.length > 0) {
    problems.push(`missing assignment${missing.length > 1 ? "s" : ""} for ` + quoteList(missing));
  }

  for (let [name, assignment] of Object.entries(assignments)) {
    if (!Object.hasOwn(blueprintBindings, name)) continue;
    let expected = blueprintBindings[name]!.type;
    if (assignment.type !== expected) {
      problems.push(`"${name}" needs a ${expected} assignment, not ${assignment.type}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Can't create a gadget from this blueprint: ${problems.join("; ")}. ` +
        `Assign each of the blueprint's bindings (${quoteList(Object.keys(blueprintBindings))}) ` +
        `exactly once.`);
  }
}

function quoteList(names: string[]): string {
  return names.length === 0 ? "none" : names.map(name => `"${name}"`).join(", ");
}
