import { runBrregImport } from "./jobs/brregImport.js";
import { runEvaluateSignals } from "./jobs/evaluateSignals.js";
import { runGenerateSignals } from "./jobs/generateSignals.js";
import { runMarkSignalFeedback } from "./jobs/markSignalFeedback.js";
import { runPreviewSignals } from "./jobs/previewSignals.js";
import { runReviewSignals } from "./jobs/reviewSignals.js";
import { runResetData } from "./jobs/resetData.js";
import { runSeedCrmContext } from "./jobs/seedCrmContext.js";
import { runSeedLocalContext } from "./jobs/seedLocalContext.js";
import { runSimulateChange } from "./jobs/simulateChange.js";

function printHelp(): void {
  console.log("crm_signal worker");
  console.log("");
  console.log("Commands:");
  console.log("  brreg:import --scope oslo --limit 100");
  console.log("  dev:reset-data --yes");
  console.log("  dev:seed-crm-context");
  console.log("  dev:seed-local-context");
  console.log("  dev:simulate-change --type business-address [--orgnr 999999999]");
  console.log("  signals:evaluate --limit 20 [--weak-limit 10] [--nace-limit 10]");
  console.log("  signals:generate --limit 100");
  console.log("  signals:mark --id <signal-id> --rating useful|maybe|noise [--reason text]");
  console.log("  signals:preview --limit 20");
  console.log("  signals:review --limit 20 [--all]");
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "brreg:import") {
    await runBrregImport(args);
    return;
  }

  if (command === "dev:simulate-change") {
    await runSimulateChange(args);
    return;
  }

  if (command === "dev:reset-data") {
    await runResetData(args);
    return;
  }

  if (command === "dev:seed-local-context") {
    await runSeedLocalContext();
    return;
  }

  if (command === "dev:seed-crm-context") {
    await runSeedCrmContext();
    return;
  }

  if (command === "signals:generate") {
    await runGenerateSignals(args);
    return;
  }

  if (command === "signals:evaluate") {
    await runEvaluateSignals(args);
    return;
  }

  if (command === "signals:review") {
    await runReviewSignals(args);
    return;
  }

  if (command === "signals:mark") {
    await runMarkSignalFeedback(args);
    return;
  }

  if (command === "signals:preview") {
    await runPreviewSignals(args);
    return;
  }

  throw new Error(`Unknown worker command: ${command}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
