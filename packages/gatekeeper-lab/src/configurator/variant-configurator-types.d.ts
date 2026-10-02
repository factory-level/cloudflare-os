export type VariantConfiguratorValues = {
  studyId?: string | null;
  label?: string | null;
};

export interface VariantConfiguratorRpc {
  /** The resource URL for one variant of one study. Throws if either is not valid. */
  resourceUrl(studyId: string, label: string): Promise<string>;
}
