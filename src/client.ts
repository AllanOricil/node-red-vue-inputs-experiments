// NOTE: this module is generated by nrg
import init from "./index.client";

(async function () {
  try {
    console.log("Running provided init");
    await init();
    console.log("Finished running provided init");
  } catch (error) {
    console.error("Error while running provided init:", error);
  }
})();
