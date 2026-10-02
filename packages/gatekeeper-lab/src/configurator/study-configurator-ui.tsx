import { Field, h, Section, TextInput, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type { StudyConfiguratorRpc, StudyConfiguratorValues } from "./study-configurator-types";

export default {
  initial: { studyId: "" },

  isReady({ values }) {
    return Boolean(values.studyId);
  },

  async resourceUrl({ values, ui }) {
    return await ui.resourceUrl(values.studyId ?? "");
  },

  render({ values, setValues }) {
    return <Section>
      <Field label="Study ID" description="The study's ID from the lab, e.g. stu_0001.">
        <TextInput
          name="studyId"
          value={values.studyId}
          placeholder="stu_0001"
          onChange={(studyId) => setValues({ studyId })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<StudyConfiguratorRpc, StudyConfiguratorValues>;
