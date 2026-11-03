# Resume import baseline (model: gemini-3.5-flash-lite, 20 fixtures)

Fields: 657 total, 648 correct, 9 wrong, 4 null. Calls: 20, failed 0.

Known limits (documented, not fixed):
- 08b interleaved columns: summary and one bullet removed by the containment check; one further bullet mis-assigned by the model. The guard is not relaxed (threshold 0.85 also governs the invented-tail case, T-023 section 7a item 5).
- 07 repeated footers: the model files page furniture under unslotted. Fix pending: generic repeated-line removal before the model (rules file, rule 4).
Not measured: real pdf-parse output from a fabricated PDF.

Settings: request timeout 15 s; temperature 0; 8 distinct fixture classes, each with an entity-swap twin.