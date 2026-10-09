# Lab Analytics

Two linked views of the whole trading lab:

- **Experiments** lists every study, newest first, with its status, open alerts, and each variant's
  virtual equity and change. Open a study to see each variant's equity over the cycles it ran,
  its health, and its alerts.
- **Agents** lists every agent that has recorded runs. Open an agent to see its cycles, outcomes,
  decisions, orders, risk refusals, fills, simulated fees, virtual equity change, and reported cost,
  overall and for each revision, with a chart of its decisions and its equity change per revision.
  Each revision links to the studies that ran it.

Results are virtual: nothing here is live performance, and nothing is ranked. Cost is what each
agent reported for its own runs, not a metered amount.

Bind `LAB_ANALYTICS` through the trading lab connector. The view only reads.
