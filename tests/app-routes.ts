import { DEFAULT_ROUTE, parseHash } from "../src/components/layout/routes.ts";

function assert(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testOnboardingRouteIsAddressable() {
  assert(parseHash("#onboarding") === "onboarding", "Onboarding route should be directly addressable");
}

function testExistingRoutesRemainAddressable() {
  assert(parseHash("#overview") === "overview", "Overview route should remain directly addressable");
  assert(parseHash("#aws") === "aws", "AWS route should remain directly addressable");
  assert(parseHash("#missing") === DEFAULT_ROUTE, "Unknown routes should still fall back to the default route");
}

testOnboardingRouteIsAddressable();
testExistingRoutesRemainAddressable();
console.log("App route tests passed.");
