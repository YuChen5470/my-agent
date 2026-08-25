import { disableTool } from "eve/tools";

// See bash.ts — sandbox filesystem access is not needed and widens the
// surface the model can reach outside its three maths tools.
export default disableTool();
