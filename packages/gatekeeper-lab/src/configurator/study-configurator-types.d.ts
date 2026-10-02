export type StudyConfiguratorValues = {
  studyId?: string | null;
};

export interface StudyConfiguratorRpc {
  /** The resource URL for one study. Throws if the ID is not a study ID. */
  resourceUrl(studyId: string): Promise<string>;
}
