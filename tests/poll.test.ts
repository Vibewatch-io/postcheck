import { test } from "node:test";
import assert from "node:assert/strict";
import { shownPoll, timeLeft, type Poll } from "../src/lib/poll";

const poll: Poll = { choices: ["Yes", " ", "No"], images: [null, null, null], minutes: 1440 };

// X stores a post over 280 weighted characters with no poll (tests 94, 94b); fewer than two filled
// choices is no poll either.
test("a poll shows only at 280 or under and with two choices", () => {
  assert.equal(shownPoll(poll, 280), poll);
  assert.equal(shownPoll(poll, 281), null);
  assert.equal(shownPoll({ ...poll, choices: ["Yes", "", ""] }, 10), null);
});

// The footer just after posting, per client: x.com "23 hours left" (test 57), the app's two units
// ("22 hours 10 minutes left", test 57) and its image-poll short form ("23h left", test 57b).
test("time left reads the way each client prints it", () => {
  assert.equal(timeLeft(1440, "web"), "23 hours left");
  assert.equal(timeLeft(7 * 1440, "web"), "6 days left");
  assert.equal(timeLeft(5, "web"), "4 minutes left");
  assert.equal(timeLeft(1440, "app"), "23 hours 59 minutes left");
  assert.equal(timeLeft(1440, "app-short"), "23h left");
  assert.equal(timeLeft(61, "app"), "1 hour left");
});
