import { proxyAegis } from "./proxy.js";

export default function handler(req, res) {
  return proxyAegis(req, res);
}
