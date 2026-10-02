import { Field, h, RadioCards, Section, TextInput, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  RevisionsConfiguratorRpc, RevisionsConfiguratorValues,
} from "./revisions-configurator-types";

const KINDS = [
  { value: "workflow", title: "Workflow", description: "A trading workflow Gadget." },
  { value: "strategy", title: "Strategy", description: "A strategy and its pinned parts." },
  { value: "agent", title: "Agent", description: "An agent profile." },
  { value: "skill", title: "Skill", description: "A skill used by agents." },
];

export default {
  initial: { kind: "workflow", name: "" },

  isReady({ values }) {
    return Boolean(values.kind && values.name);
  },

  async resourceUrl({ values, ui }) {
    return await ui.resourceUrl(values.kind ?? "", values.name ?? "");
  },

  render({ values, setValues }) {
    return <Section>
      <Field label="Kind" description="What kind of artifact to read.">
        <RadioCards value={values.kind} options={KINDS} onChange={(kind) => setValues({ kind })} />
      </Field>
      <Field
        label="Name"
        description="The artifact's published name, e.g. breakout-workflow. Every revision of this name becomes readable."
      >
        <TextInput
          name="name"
          value={values.name}
          placeholder="breakout-workflow"
          onChange={(name) => setValues({ name })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<RevisionsConfiguratorRpc, RevisionsConfiguratorValues>;
