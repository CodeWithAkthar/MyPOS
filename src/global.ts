/* eslint-disable @typescript-eslint/no-explicit-any */
import getConfig from "./config";
import Utils from "./utils";

(global as any).config = getConfig();
(global as any).utils = new Utils();
