import { disableTool } from "eve/tools";

// This agent declares no skills, but the model kept calling load_skill looking
// for a "python" / "calculator" / "math" skill once bash was taken away —
// burning turns on guaranteed errors. Remove it so the only paths forward are
// the three maths tools.
export default disableTool();
