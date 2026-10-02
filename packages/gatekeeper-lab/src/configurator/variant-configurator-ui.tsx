import { Field, h, Section, TextInput, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type { VariantConfiguratorRpc, VariantConfiguratorValues } from "./variant-configurator-types";

export default {
  initial: { studyId: "", label: "" },

  isReady({ values }) {
    return Boolean(values.studyId && values.label);
  },

  async resourceUrl({ values, ui }) {
    return await ui.resourceUrl(values.studyId ?? "", values.label ?? "");
  },

  render({ values, setValues }) {
    return <Section>
      <Field label="Study ID" description="The study's ID from the lab, e.g. stu_0001.">
        <TextInput name="studyId" value={values.studyId} placeholder="stu_0001"
          onChange={(studyId) => setValues({ studyId })} />
      </Field>
      <Field label="Variant" description="The variant's label in that study, e.g. a. Each variant trades its own virtual portfolio.">
        <TextInput name="label" value={values.label} placeholder="a" onChange={(label) => setValues({ label })} />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<VariantConfiguratorRpc, VariantConfiguratorValues>;
