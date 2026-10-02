import { Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type { AnalyticsConfiguratorRpc, AnalyticsConfiguratorValues } from "./analytics-configurator-types";

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
        label="Lab analytics"
        description="Reads every study, each variant's equity over time, and what each agent decided, ordered, filled, and reported spending. Results are virtual. Nothing can be changed through this connection."
      >
        <span />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<AnalyticsConfiguratorRpc, AnalyticsConfiguratorValues>;
