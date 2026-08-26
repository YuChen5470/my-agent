# The Maths Engine

An AI tutor for university level mathematicians that explains methods rather than just giving over answers to students. It never does arithmetic or algebra "in its head", every number or symbolic result it states comes back from a verified tool call. This means that what students see on screen has actually be computed, not guessed by the language model. For worded problems, it states its interpretation and assumptions and asks the students to confirm its interpretations before calculating.

Built with Next.js and the [eve](https://www.npmjs.com/package/eve) agent framework, running Gemini as the underlying model.

## Tools

Three tools do the actual maths. The model can only talk about a number once one of these has handed it back.

**`calculate`** — the general-purpose one. Give it an expression like `"x^3 + 2x"` and tell it what to do with it: evaluate it (optionally plugging in values, e.g. `x = 2`), differentiate it with respect to a variable, or simplify it. It hands back the exact result, a decimal version when that's useful, and a short note on how it got there.

**`number_theory`** — for whole-number questions: is this prime, what are its prime factors, what's the greatest common divisor or lowest common multiple of two numbers, what's the remainder. Give it one or two integers and which of those you want, and it returns the answer along with the reasoning, e.g. `12 = 2^2 x 3`.

**`plot_function`** — turns an expression into a graph. Give it a function, a variable, and a range to plot over, and it samples the curve and draws it in the chat, splitting it into separate pieces wherever the function breaks (like at an asymptote).

Alongside these, the agent also has a built-in `ask_question` tool it reaches for on worded problems — it uses this to lay out the assumptions it's making (starting height, direction, which constant to use) and get the student's confirmation before turning the words into an expression.

## Running it locally

Requires Node.js 20 or later.

```bash
git clone https://github.com/YuChen5470/my-agent.git
cd my-agent
npm install
```

Create a `.env.local` file in the project root with:

```
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Screenshots

![The Maths Engine plotting 1/x, with its asymptotes and end behaviour explained](docs/screenshot-plot.png)

![The Maths Engine differentiating x^3 + x^2 - e^2x term by term](docs/screenshot-derivative.png)
