import { examples } from "@jsv/protocol";

console.log("Keys:", Object.keys(examples));
const first = examples[Object.keys(examples)[0]];
console.log(
  "First example events:",
  JSON.stringify(first.events.slice(0, 5), null, 2),
);
