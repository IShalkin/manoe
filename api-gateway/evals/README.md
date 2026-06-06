# MANOE prompt-evaluation harness (promptfoo)

A **runnable scaffold** for measuring the quality of MANOE's narrative prompts
with LLM-as-a-judge. It is **not yet wired into the live orchestrator** — it is
an offline regression gate you run by hand (or later, in CI) when you change a
prompt, to compare quality *before/after*.

## Why this exists / how it fits MANOE

MANOE already has two **runtime** quality mechanisms:

- **`CriticAgent`** (`../src/agents/CriticAgent.ts`) — critiques each scene
  in-pipeline and drives the revision loop.
- **`EvaluationService`** (`../src/services/EvaluationService.ts`) — LLM-as-judge
  faithfulness/relevance scoring that writes to Langfuse/Prometheus during a run.

Those grade **output produced inside a single run**. This harness is different:
it grades **the prompt itself**, offline, against a **fixed golden set**, so a
prompt edit can be scored on the same inputs and compared. It **complements**,
and deliberately does **not duplicate**, the runtime path.

Quality dimensions graded by the rubrics (one `llm-rubric` per dimension):

| Dimension          | What the judge checks                                              |
|--------------------|-------------------------------------------------------------------|
| **structure**      | Adheres to the outline: hits the beat, ends on the hook, in scope |
| **consistency**    | No character/world drift vs. the stated constraints (anachronisms, new names) |
| **show-don't-tell** | Dramatizes via sensory detail/action instead of naming feelings   |

`originality` and `impact` (MANOE's other dimensions, owned at runtime by
`OriginalityAgent` / `ImpactAgent`) are left as **TODO rubrics** in the config so
the scaffold stays focused; add them the same way when ready.

## Files

| File | Purpose |
|------|---------|
| `promptfooconfig.yaml` | The eval config: Bedrock providers, the real MANOE Writer DRAFTING prompt under test, and 3 test cases with per-dimension `llm-rubric` assertions. |
| `golden/example-dataset.yaml` | ONE illustrative golden example showing the intended input shape (seed → outline → constraints → expected qualities). A real golden set must be curated. |
| `README.md` | This file. |

The prompt under test was transcribed from the real Writer agent:
`../src/agents/WriterAgent.ts` (`getFallbackPrompt` ~L124–130 and the DRAFTING
branch of `buildUserPrompt` ~L276–297). The canonical names live in Langfuse as
`manoe-writer-v1` (`AGENT_PROMPTS.WRITER` in `../src/services/LangfuseService.ts`).

## Running it

From **this directory**:

```bash
cd api-gateway/evals
npx promptfoo@latest eval         # run all test cases
npx promptfoo@latest view         # open the results web UI
```

> promptfoo is run via `npx` on purpose — it is **not** installed and **not**
> added to the app's `package.json`. Pure-JS, no native compile.

### Required environment

The judge **and** the model-under-test both run on **AWS Bedrock (US region)**:

| Var | Why |
|-----|-----|
| `AWS_REGION` | US Bedrock region (confirmed US). Or set `region:` in the provider `config`. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | Standard AWS creds (STS token if assuming a role). |
| `NODE_EXTRA_CA_CERTS` | **Corp Zscaler MITM** — point Node's TLS at the corp CA bundle (`C:\Users\shalkin\corp-ca-bundle.pem`). Already exported in this shell. `AWS_CA_BUNDLE` set to the same PEM also works for the AWS SDK. |

Example (MSYS2 bash):

```bash
export AWS_REGION=us-east-1
export NODE_EXTRA_CA_CERTS=/c/Users/shalkin/corp-ca-bundle.pem
cd api-gateway/evals && npx promptfoo@latest eval
```

If you see `self-signed certificate in certificate chain`, `NODE_EXTRA_CA_CERTS`
is not set in the env that `npx` inherited — re-export it in the interactive
shell (unlike `npm install` lifecycle scripts, `npx promptfoo` inherits it fine).

### Reading results

- The terminal prints a per-assertion **PASS/FAIL** grid plus the judge's one-line
  reasoning, and an aggregate pass-rate per prompt.
- `npx promptfoo@latest view` opens a browser UI to diff outputs side-by-side —
  useful for **before/after** prompt comparisons (run the eval, edit the prompt,
  run again, compare).
- Results are cached locally by promptfoo; use `--no-cache` to force fresh
  generations after a prompt change.

## Caveats (read before trusting a number)

- **Cost.** Every test case makes (at least) two Bedrock calls: one to *generate*
  the scene, one (or more, one per rubric) for the *judge*. A real golden set of
  N scenes × M rubrics multiplies fast. Use a cheap judge model (the config
  defaults the grader to Haiku) and cache between runs. Budget before scaling up.
- **Circularity (LLM grading LLM).** The judge is itself an LLM, so its grades
  carry the same biases as the thing it grades. Treat scores as a **relative**
  signal (did this prompt edit move the needle?), not absolute truth, and
  **periodically calibrate against human judgment** — spot-check a sample of
  graded outputs by hand and adjust rubrics when the judge disagrees with you.
- **No real golden set yet.** `golden/example-dataset.yaml` is a single stub.
  A trustworthy eval needs a curated set (20–50+ cases, genre/tone spread,
  deliberate should-FAIL cases, ideally exported from real Langfuse traces) with
  human-reviewed expected qualities. The inlined test cases in the config are
  illustrative placeholders, not a benchmark.

## Future work (not done here)

- Pull the prompt-under-test **live from Langfuse** (`manoe-writer-v1`) instead of
  inlining it, so the eval always tests the deployed prompt.
- Expand rubrics to **originality** and **impact** (complementing the agents).
- Wire `npx promptfoo eval` into **CI** as a gate on prompt-change PRs (fail the
  build if pass-rate regresses below a threshold).
- Externalize the test cases to read directly from `golden/`.
