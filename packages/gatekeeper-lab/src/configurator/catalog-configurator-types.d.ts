export type CatalogConfiguratorValues = Record<string, never>;

export interface CatalogConfiguratorRpc {
  /** The catalog's resource URL. There is only one catalog per lab. */
  resourceUrl(): Promise<string>;
}
