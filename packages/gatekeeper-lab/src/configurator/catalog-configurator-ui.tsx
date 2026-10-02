import { Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type { CatalogConfiguratorRpc, CatalogConfiguratorValues } from "./catalog-configurator-types";

export default {
  initial: {},

  isReady() {
    return true;
  },

  async resourceUrl({ ui }) {
    return await ui.resourceUrl();
  },

  render() {
    return <Section>
      <Field
        label="Everything published"
        description="Reads every published skill, workflow, agent, and strategy, their revisions, and their files. Nothing can be changed through this connection."
      >
        <span />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<CatalogConfiguratorRpc, CatalogConfiguratorValues>;
