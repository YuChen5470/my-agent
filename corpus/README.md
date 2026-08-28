# corpus/

The documents `search_documents` searches. **This folder is empty in the repo on
purpose** — the papers it held are King's College London exam material and are
not mine to redistribute. The pipeline that reads them is committed; the
documents themselves you supply.

`.gitignore` keeps everything in here out of the repo except this file, so you
can drop documents in without accidentally committing them.

## What to put here

Any mix of `.pdf`, `.md`, and `.txt`. The ingest script reads all three and
ignores everything else. The index this app was built against held twelve files:

| Document | What it is | Where to get it |
| --- | --- | --- |
| `ALEVELEDEXGOVAIWRK.pdf` | Edexcel A level Mathematics specification (9MA0) | [Pearson qualifications](https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/mathematics-2017.html) — "Specification" under Course materials |
| `5CCM231A_*`, `NL5ccm231A2022*` | KCL 5CCM231A past papers and solutions | KCL KEATS module page, or your department |
| `5CCM241A_*`, `241A_May_2023_solutions.pdf` | KCL 5CCM241A past papers and solutions | as above |
| `May 2025 exam and solutions.pdf`, `May 2025 level5.pdf`, `May24_ProbaStats2_level5_Finalfile.pdf` | KCL level 5 probability and statistics papers | as above |

Nothing depends on those exact files. Any coherent set of documents works — the
agent cites whatever filenames it finds, so name them something a student would
recognise on screen.

## Then build the index

From the repo root, once `CF_*` is set in `.env.local`:

```bash
npm run rag:ingest
```

See the README's "Building the document index" section for what it expects and
how long it takes.
