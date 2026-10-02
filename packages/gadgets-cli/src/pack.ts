// Builds a skill directory into the `.gadget` archive a Workshop imports, using the bundled-blueprint
// build's own reader and codec, so a skill is packed exactly the way a bundled blueprint is.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  buildContent,
  parseArchive,
  parseBundledBlueprintManifest,
  readSourceFiles,
  serializeArchive,
} from "@gadgets/bundled-blueprints";

/** A skill directory built into its archive. */
export type PackedSkill = {
  /** The directory's name, used as the archive's label. */
  name: string;
  /** The manifest's install ID, e.g. `skill.momentum-signal`. */
  blueprintId: string;
  title: string;
  version: number;
  /** The whole `.gadget` archive. */
  archive: Uint8Array;
  /** The archive's content section: the bytes `contentSha256` is the hash of. */
  content: Uint8Array;
  /**
   * SHA-256 (hex) of the archive's content section, the gzip-compressed snapshot of the files. A
   * Workshop stores and serves that section verbatim while it may rewrite the metadata, so this,
   * not a hash of the whole archive, is what identifies the code on both sides of a push.
   */
  contentSha256: string;
};

/** Packs `directory` (a `blueprint.json` plus `files/`). Identical source gives identical bytes. */
export async function packSkill(directory: string): Promise<PackedSkill> {
  const name = basename(resolve(directory));
  const manifest = parseBundledBlueprintManifest(
      name, await readFile(join(directory, "blueprint.json"), "utf8"));
  const files = await readSourceFiles(join(directory, "files"), `${name}/files`);
  const content = buildContent(files, name);
  const metadata = {
    title: manifest.title,
    description: manifest.description,
    author: manifest.author,
    created: manifest.created,
    version: manifest.version,
    lastUpdated: manifest.lastUpdated,
    output: manifest.output,
    bindings: manifest.bindings,
  };
  return {
    name,
    blueprintId: manifest.blueprintId,
    title: manifest.title,
    version: manifest.version,
    archive: serializeArchive(metadata, content, name),
    content,
    contentSha256: sha256Hex(content),
  };
}

/** The content hash of an archive, as `PackedSkill.contentSha256` defines it. */
export function archiveContentSha256(archive: Uint8Array, label: string): string {
  return sha256Hex(parseArchive(archive, label).content);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
