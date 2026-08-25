# The Maths Engine: computation tools

Status: ready-for-agent

## Problem Statement

A student working through university-level mathematics has two kinds of tool available, and
neither one teaches them anything.

A calculator or CAS gives them a correct answer with no method. They can see that the integral
evaluates to 4/3, but not why the substitution was the right move, so the next problem defeats
them exactly as thoroughly as this one did.

A chatbot gives them method and answers together, fluently, and quietly gets some of the
arithmetic wrong. This is worse than being unhelpful, because the student cannot tell which
parts to trust. A confidently stated wrong number looks exactly like a confidently stated right
one. Having to re-derive every value defeats the point of asking; not re-deriving them means
learning something false.

The student needs the explanation a tutor gives and the reliability a calculator gives, without
having to decide, line by line, which of the two they are currently being handed.

## Solution

A tutor that explains method in words and never performs arithmetic itself. Every number and
every symbolic result it states comes back from a tool call, and the student can see the tool
call that produced it.

The division of labour is strict. The agent decides what to compute and why, names the
technique, and explains where it applies. The tools do all computing. Because the agent has no
means of computing, there is no failure mode where it quietly does the sum in its head — the
guarantee is structural rather than a promise the model makes about itself.

The student gets three capabilities: evaluating and manipulating expressions, plotting
functions, and elementary number theory. Each renders in the transcript as a visible tool call,
so a student who wants to check where a number came from can, and a student who does not can
simply read the explanation and trust it.

## User Stories

1. As a student, I want the tutor to explain which technique applies to my problem, so that I
   can recognise the same situation next time without help.
2. As a student, I want every number in the tutor's explanation to come from a computation, so
   that I do not have to check its arithmetic myself.
3. As a student, I want to see the tool call that produced each result, so that I can trace any
   number back to its source when I doubt it.
4. As a student, I want the tutor to evaluate a numeric expression, so that I can check my own
   working on a problem I have already attempted.
5. As a student, I want the tutor to differentiate an expression symbolically, so that I can
   compare its result against the derivative I computed by hand.
6. As a student, I want the tutor to integrate an expression, so that I can check an
   antiderivative I am unsure about.
7. As a student, I want the tutor to evaluate a definite integral over a range, so that I can
   confirm the number I got after substituting limits.
8. As a student, I want the tutor to simplify a messy expression, so that I can see whether my
   answer matches the textbook's differently-arranged one.
9. As a student, I want the tutor to solve an equation for a variable, so that I can check the
   roots I found.
10. As a student, I want the tutor to evaluate a limit, so that I can verify behaviour at a
    point where the function is undefined.
11. As a student, I want the tutor to name the technique it used, so that I learn the technique
    and not just the answer.
12. As a student, I want to see both the exact and the decimal form of a result, so that I can
    match whichever form my problem sheet expects.
13. As a student, I want the tutor to call a tool even for trivial arithmetic, so that the
    guarantee holds uniformly and I never have to wonder which numbers were checked.
14. As a student who asks the tutor to skip the tool, I want a brief explanation rather than a
    lecture, so that the conversation stays about maths.
15. As a student, I want to plot a function over a range, so that I can see its shape rather
    than only its algebra.
16. As a student plotting a function with an asymptote, I want the curve broken at the
    asymptote, so that I am not shown a line implying the function has a value there.
17. As a student plotting a function undefined over part of the range, I want nothing drawn
    where it is undefined, so that the graph does not assert something false.
18. As a student, I want to hover over the graph and read off coordinates, so that I can
    inspect specific points without a separate calculation.
19. As a student reading coordinates off the graph, I want those values to have come from the
    plotting tool, so that the hover readout carries the same guarantee as the prose.
20. As a student, I want axes that cross at the origin with a correct aspect ratio, so that the
    graph looks like the ones in my lectures.
21. As a student, I want to check whether a number is prime, so that I can verify a step in a
    number-theory problem.
22. As a student, I want a number's prime factorisation, so that I can check my own
    factorisation.
23. As a student, I want gcd and lcm of two numbers, so that I can confirm working in a
    modular-arithmetic problem.
24. As a student giving the tutor a word problem, I want it to state its interpretation before
    computing, so that I can catch a misreading before it produces a confident wrong answer.
25. As a student giving a word problem, I want the tutor's modelling assumptions stated
    explicitly, so that I can correct the ones that do not match my textbook's conventions.
26. As a student, I want to confirm or correct the tutor's interpretation, so that translating
    prose into maths stays my skill to learn rather than something done invisibly for me.
27. As a student who reloads the page mid-question, I want a pending confirmation still to be
    there, so that I do not lose my place.
28. As a student giving the tutor mathematical notation directly, I want it to proceed without
    asking, so that the confirmation step appears only where it is useful.
29. As a student working from a problem sheet, I want help with the method rather than a refusal,
    so that I can actually use the tutor for the work I have.
30. As a student, I want the tutor never to reply with a bare answer, so that reading the
    reasoning is unavoidable.
31. As a student, I want the tutor not to guess whether my question is graded coursework, so
    that I am not wrongly refused help while revising.
32. As a student asking something off-topic, I want one short redirect, so that the tutor stays
    a maths tutor.
33. As a student, I want the tutor to work across calculus, linear algebra, complex numbers,
    differential equations, series and statistics, so that one tool covers my degree.
34. As a student, I want mathematical notation rendered properly in the tutor's prose, so that
    I can read it as maths rather than as ASCII.
35. As a student whose expression cannot be parsed, I want to be told what went wrong, so that
    I can correct my input rather than guess.
36. As a student, I want a long-running computation to fail cleanly rather than hang, so that
    the conversation stays usable.
37. As a developer, I want the model to have no computation path outside the three tools, so
    that the product guarantee cannot be quietly violated.
38. As a developer, I want an eval asserting the tool was called, so that a prompt change
    cannot silently reintroduce mental arithmetic.
39. As a developer, I want expression input never passed to `eval`, so that a hostile
    expression cannot execute code.
40. As a developer, I want each tool's inputs schema-validated, so that malformed model output
    fails at the boundary rather than inside the maths.

## Implementation Decisions

**Framework and layout.** The agent is authored as an eve agent under a nested `agent/`
directory inside the existing Next.js app, mounted by wrapping the Next config with eve's
Next.js integration. Tool filenames are the model-facing tool names, following eve's snake_case
convention throughout its own examples.

**Client hook.** The UI uses eve's own React hook, not the AI SDK's `useChat`. This deviates
from the workshop instructions, and the deviation is forced: eve's message type follows the AI
SDK's rendering convention for common part types but the docs state the types are not
interchangeable, and no adapter exists. AI Elements components are generic presentation
components and render fine from eve's message parts.

**Built-in tools are disabled.** eve ships `bash`, `read_file`, `write_file`, `web_fetch`,
`web_search`, `agent` and `load_skill` by default. During testing the model was observed
answering "what is 2+2" by running `echo $((2 + 2))` in eve's sandbox, exit code 0 — computing
the answer entirely outside the tool system while appearing to work correctly. Each is removed
with a disable sentinel. This is the single most important decision in the spec: without it the
product guarantee is void and nothing in the output looks wrong.

**Three tools, not more.** A single `calculate` tool covers evaluation and symbolic operations
behind an operation discriminator, rather than splitting into one tool per operation. Fewer
tools generally improves model tool-selection. If testing shows it misrouting between
operations, splitting differentiation and integration into their own tools is the first
remedy — but start with three.

**Computation is numeric-first, symbolic-second.** Numeric evaluation runs in-process in the
Node runtime via a JavaScript maths library, which is a parser rather than an evaluator and
therefore never reaches JS scope. Symbolic work that the JavaScript library cannot do —
integration, equation solving, limits, series — is deferred (see Out of Scope). The tool
reports honestly when an operation is unsupported rather than approximating.

**Safety of expression input.** No user or model-supplied string is ever passed to `eval` on
either side of any boundary. The maths library's own parser handles input, with its `import`,
`createUnit` and `evaluate` functions disabled so an expression cannot redefine the evaluator's
namespace. The realistic threat is denial of service via a cheap-to-write expensive expression,
not code execution.

**There is no wall-clock timeout, and one is not achievable in-process.** An earlier draft of
this spec claimed one; that was wrong. mathjs evaluates synchronously on the event loop, so a
single expensive expression blocks the process and cannot be interrupted from outside. The only
defence available is to refuse the expression *before* evaluating it, which is what the code
does: a length cap and a parse-tree leaf-count cap, both checked pre-evaluation. This is a
weaker guarantee than a timeout and is recorded as such rather than papered over. Moving the
parser into a worker thread would allow genuine termination and is the upgrade path.

**Plot output is an array of segments, not a flat array of points.**

```ts
type PlotResult = { segments: Array<Array<{ x: number; y: number }>> }
```

The tool splits the curve wherever the function is undefined or jumps discontinuously. A flat
array with null gaps would depend on the chart library lifting the pen; where it does not, it
draws a near-vertical line through the asymptote, showing a student a line that appears to cross
x=0 and implying `1/x` has a value there. Segments make the false picture unrepresentable
rather than merely unlikely. A continuous function returns a single segment, so simple cases
cost nothing.

**Plot rendering uses a maths-native library.** A business charting library was rejected: it
places axes on the outer edges and does not preserve aspect ratio, so a circle would not look
circular. The chosen library supplies viewport-in-maths-units, origin-crossing axes, and the
screen-to-maths transforms that the hover feature is built on.

**Hover readout snaps to the nearest sampled point and never re-evaluates the function
client-side.** Evaluating f(x) in the browser at the hovered position would create a fourth
computation path outside the tool system, silently breaking the guarantee for the numbers most
likely to be read closely. Snapping keeps every displayed value traceable to the plotting tool's
result. The cost is a slightly stepped readout at low sample density, which is addressed by
sampling more densely rather than by interpolating.

**Word problems use eve's built-in question mechanism, not tool approval.** Tool approval gates
a call the model has already decided to make; the question mechanism lets the model pause
mid-turn to ask something arbitrary, which is what restating an interpretation is. It parks the
turn durably, so a pending confirmation survives a page reload — something prompt discipline
alone cannot provide. The trigger rule lives in the instructions: before computing on a word
problem, restate the interpretation and its assumptions and wait.

**Model output projection.** Where a tool's useful output is large — notably the plot's
coordinate arrays — the tool projects a compact summary for the model while the full payload
reaches the UI. The model does not need several hundred coordinate pairs in its context to
describe the shape of a curve.

**Homework behaviour is a rule about form, not permission.** No attempt is made to detect graded
work. Detection would produce constant false positives, since a question from a marked problem
sheet is textually identical to one from a past paper being revised, and is defeated by retyping
without the label. Instead the tutor always walks the method and never replies with a bare
answer, which filters copying without punishing honest use and behaves identically for every
question.

**Production authentication must be authored.** eve's default channel policy fails closed:
without an explicit channel file, production browser traffic receives 401 while local
development works normally. For a public demo holding no user data, anonymous access is
admitted explicitly. This is a deliberate, narrow choice and is not appropriate for an agent
touching private data.

## Testing Decisions

**What makes a good test here.** Assert on external behaviour: what the agent did and what came
back. A test that inspects how a tool arrived at its answer will break the first time the
implementation changes while telling you nothing about whether the student was served
correctly. The interesting assertions are *did the right tool get called* and *does the reply
contain the right result* — not which internal branch ran.

**Single seam: eve's eval runner.** Evals live in an `evals/` directory as one file per eval,
and exercise the same HTTP surface a real user hits — the runner boots a real agent server,
drives a real session, and grades what comes back. This is the highest available seam and
requires no new test infrastructure or dependencies.

It is also the only seam that can test the central claim. A unit test on a tool proves the tool
computes correctly; it cannot prove the model *called* it rather than answering from its head.
That is precisely the bug found during scaffolding, and `t.calledTool(...)` is the assertion
that catches it. A guarantee that nothing tests is a guarantee that will regress on the next
prompt edit.

**What to cover.** For each tool, one eval driving a representative question, asserting the run
succeeded, asserting the tool was called, and checking the reply contains the expected value.
Plus two behavioural evals that matter more than the arithmetic: that a trivial arithmetic
question still produces a tool call, and that a word problem produces a confirmation question
before any computation tool runs.

**Prior art.** None in this repo — it is a fresh scaffold with no test script and no test
framework. The eve documentation's own eval examples are the pattern to follow.

**Cost.** Every eval assertion is a live model call against a rate-limited free tier. Keep the
suite small and behavioural rather than exhaustive; breadth of maths correctness is not what
this seam is for.

## Out of Scope

**Symbolic integration, equation solving, limits and series.** These need a real CAS, which in
practice means Python and SymPy running as a separate always-warm service with its own hosting.
That is a second runtime, a deployment, and a hardening exercise — parsing with an explicit
symbol dictionary and no builtins reachable, never sympifying a raw string, and capping
expression depth against expressions that hang the process. Worth doing, but not before the
JavaScript-only version is deployed and working. The tool reports these operations as
unsupported rather than approximating them.

**Unit tests on tool internals.** Deliberately excluded rather than overlooked. They would add
a second seam and a test framework, and the logic most worth table-testing — discontinuity
splitting across many functions — is also the logic most likely to change. Revisit once the
plot behaviour has settled.

**Session persistence and history.** Sessions are durable server-side, but no UI is built for
listing or revisiting past conversations.

**Authentication and per-student accounts.** Anonymous access only.

**Matrices, parametric curves, vector fields and surfaces.** The plotting tool handles a single
real-valued function of x. Extending to these would change the tool's output contract, so it is
a separate piece of work rather than an increment.

**Rate limiting and abuse protection.** The deployment is public and anonymous with no request
throttling beyond the model provider's own quota.

## Further Notes

The scaffolding phase surfaced three things worth carrying forward.

The framework's default tools were the sharpest lesson. An agent whose whole value rests on a
constraint will happily route around that constraint using capabilities the framework provided
for free, and the result looks correct. Any future capability added to this agent needs checking
against the same question: does this give the model a way to compute?

AI Elements' confirmation component turned out to be coupled to the AI SDK's tool-approval
shape and cannot render eve's question requests without fabricating an approval object. The
word-problem gate uses plainer markup instead. This is the concrete form of the docs' warning
that the two message types are not interchangeable, and more of the same should be expected
where eve and AI Elements meet.

The vendored AI Elements input component shipped with type errors against the current version of
its own UI dependency. These are invisible during development, because the dev server does not
typecheck, and fail the production build. Worth running a typecheck before relying on a deploy.
