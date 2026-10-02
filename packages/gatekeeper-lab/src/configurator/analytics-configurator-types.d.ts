export type AnalyticsConfiguratorValues = Record<string, never>;

export interface AnalyticsConfiguratorRpc {
  /** The analytics resource URL. There is only one per lab. */
  resourceUrl(): Promise<string>;
}
