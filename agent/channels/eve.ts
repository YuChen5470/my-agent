import { eveChannel } from "eve/channels/eve";
import { localDev, none } from "eve/channels/auth";

// Without this file, production browser traffic gets 401 from eve's default
// fail-closed policy — local dev works, the deployed site fails on the first
// message.
//
// none() admits anonymous requests. That is acceptable here only because this
// is a public maths tutor holding no private or user data. Do not copy this
// into an agent that touches anything sensitive.
export default eveChannel({
  auth: [localDev(), none()],
});
