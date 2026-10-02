import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
let count = 0;
for (const slug of [
  "care-appointment-preparation",
  "care-reminder-change",
  "care-sample-benefits",
]) {
  const path = `workbuddy-skills/${slug}`;
  const fixture = JSON.parse(readFileSync(`${path}/fixtures/request.json`));
  function run(value) {
    const before = JSON.stringify(value);
    const child = spawnSync(process.execPath, [`${path}/scripts/propose.mjs`], {
      input: JSON.stringify(value),
      encoding: "utf8",
    });
    assert.equal(JSON.stringify(value), before);
    const r = JSON.parse(child.stdout);
    assert.equal(r.executed, false);
    return r;
  }
  const normal = run(fixture);
  assert.equal(
    normal.status,
    slug === "care-sample-benefits" ? "information" : "proposal",
  );
  count++;
  const denied = structuredClone(fixture);
  denied.state.profiles[0].canView = false;
  assert.equal(run(denied).status, "refusal");
  count++;
  const stale = structuredClone(fixture);
  stale.expectedClock = "2020-01-01T09:00:00+08:00";
  assert.equal(run(stale).status, "clarification");
  count++;
  const mismatch = structuredClone(fixture);
  mismatch.profileId = "p-maya";
  assert.equal(run(mismatch).status, "refusal");
  count++;
  if (slug !== "care-sample-benefits") {
    const view = structuredClone(fixture);
    view.state.profiles[0].canManage = false;
    assert.equal(run(view).status, "refusal");
    count++;
    const duplicate = structuredClone(fixture);
    duplicate.state.appliedActions.push(duplicate.actionId);
    assert.equal(run(duplicate).status, "refusal");
    count++;
    const driving = structuredClone(fixture);
    driving.state.carMode = "driving";
    assert.equal(run(driving).status, "refusal");
    count++;
    const past = structuredClone(fixture);
    past.scheduledAt = past.state.now;
    assert.equal(run(past).status, "clarification");
    count++;
    const missing = structuredClone(fixture);
    delete missing.actionId;
    assert.equal(run(missing).status, "clarification");
    count++;
    const wrongSource = structuredClone(fixture);
    if (slug === "care-reminder-change") wrongSource.reminderId = "r-bath-leo";
    else wrongSource.appointmentId = "a-dental-leo";
    assert.equal(run(wrongSource).status, "refusal");
    count++;
  }
  if (slug === "care-reminder-change") {
    const advice = structuredClone(fixture);
    delete advice.userRequestedTime;
    assert.equal(run(advice).status, "clarification");
    count++;
    const incomplete = structuredClone(fixture);
    delete incomplete.scope;
    assert.equal(run(incomplete).status, "clarification");
    count++;
  }
  if (slug === "care-sample-benefits") {
    const unknown = structuredClone(fixture);
    unknown.category = "unknown";
    const reply = run(unknown);
    assert.equal(reply.items[0].status, "Needs confirmation");
    assert.equal(reply.items[0].policyDate, null);
    assert.equal(reply.sourceIds.length, 0);
    count++;
    assert.equal(normal.items[0].source, "Care plan · illustrative terms, v1");
    assert.equal(normal.items[0].status, "Listed in sample plan");
    count++;
  }
}
console.log(
  `${count} skill guard and output checks passed; all outputs executed:false; supplied state unchanged.`,
);
