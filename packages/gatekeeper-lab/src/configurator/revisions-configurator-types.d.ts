export type RevisionsConfiguratorValues = {
  kind?: string | null;
  name?: string | null;
};

export interface RevisionsConfiguratorRpc {
  /** The resource URL for one named artifact. Throws if the kind or name is not valid. */
  resourceUrl(kind: string, name: string): Promise<string>;
}
