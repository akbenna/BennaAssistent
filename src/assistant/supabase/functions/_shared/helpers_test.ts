import { assertEquals, assert } from "jsr:@std/assert@1";
import { amsterdamNu, werkdagenTussen } from "./core.ts";
import { b64urlEncode, buildRaw, encodeSubject, parseMessage } from "./google.ts";

Deno.test("werkdagen: vrijdag → maandag is 1", () => {
  assertEquals(werkdagenTussen(new Date("2026-09-18T10:00Z"), new Date("2026-09-21T09:00Z")), 1);
});
Deno.test("werkdagen: ma → ma volgende week is 5", () => {
  assertEquals(werkdagenTussen(new Date("2026-09-14T10:00Z"), new Date("2026-09-21T10:00Z")), 5);
});
Deno.test("Amsterdam zomertijd: 04:30 UTC is 06 uur", () => {
  assertEquals(amsterdamNu(new Date("2026-09-21T04:30:00Z")), { datum: "2026-09-21", uur: 6 });
});
Deno.test("Amsterdam wintertijd: 05:30 UTC is 06 uur", () => {
  assertEquals(amsterdamNu(new Date("2026-12-07T05:30:00Z")).uur, 6);
});
Deno.test("onderwerp met accenten wordt gecodeerd", () => {
  assertEquals(encodeSubject("Overleg"), "Overleg");
  assert(encodeSubject("Kennismaking – ASF").startsWith("=?UTF-8?B?"));
});
Deno.test("parseMessage leest headers en tekst", () => {
  const body = b64urlEncode("Beste Abdelkader, graag reactie vóór vrijdag.");
  const m = parseMessage({
    id: "m1", threadId: "t1", labelIds: ["INBOX"], internalDate: "1789633596000", snippet: "x",
    payload: { mimeType: "multipart/alternative", headers: [
      { name: "From", value: "Natascha <n@cz.nl>" }, { name: "To", value: "a@gmail.com, b@x.nl" },
      { name: "Subject", value: "Afspraak" }, { name: "Message-ID", value: "<abc@cz.nl>" }],
      parts: [{ mimeType: "text/plain", body: { data: body } }] },
  });
  assertEquals(m.to.length, 2);
  assertEquals(m.messageIdHeader, "<abc@cz.nl>");
  assert(m.text.includes("vóór vrijdag"));
});
Deno.test("buildRaw bevat reply-headers en utf-8 body", () => {
  const raw = buildRaw({ to: "n@cz.nl", subject: "Re: Afspraak", body: "Graag 23 september om 10.00 uur.", inReplyTo: "<abc@cz.nl>" });
  const txt = new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
  assert(txt.includes("In-Reply-To: <abc@cz.nl>"));
  assert(txt.includes("\r\n\r\nGraag 23 september"));
});
