import { disableTool } from "eve/tools";

// Removed from the model's tool set entirely.
//
// The Maths Engine's core guarantee is that every number it states came from
// one of its own three tools. eve's built-in tools break that: `bash` gives the
// model a general-purpose compute path (it was observed running
// `python3 -c "print(2 + 2)"`), and the web tools let it look up answers
// instead of deriving them. `agent` is disabled too, since a delegated child
// would otherwise inherit its own shell.
export default disableTool();
