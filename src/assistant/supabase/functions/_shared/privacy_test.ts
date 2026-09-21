import { assertEquals } from "jsr:@std/assert@1";
import { checkPrivacy, isBsn } from "./privacy.ts";

Deno.test("elfproef: geldig en ongeldig", () => {
  assertEquals(isBsn("111222333"), true);
  assertEquals(isBsn("123456789"), false);
  assertEquals(isBsn("000000000"), false);
});

Deno.test("zorgmaildomein wordt uitgesloten", () => {
  const r = checkPrivacy({ from: "roosendael@ezorg.nl", subject: "Overleg" });
  assertEquals(r.excluded, true);
});

Deno.test("subdomein van hard domein wordt uitgesloten", () => {
  const r = checkPrivacy({ from: "a@mail.zorgmail.nl", subject: "x" });
  assertEquals(r.excluded, true);
});

Deno.test("patiëntsignaal in tekst", () => {
  const r = checkPrivacy({ from: "x@meditta.nl", text: "Betreft: patiënt J. de Vries" });
  assertEquals(r.excluded, true);
});

Deno.test("BSN met elfproef in tekst", () => {
  const r = checkPrivacy({ from: "x@gmail.com", text: "nummer 111222333" });
  assertEquals(r.excluded, true);
});

Deno.test("businesscase met 'patiënten' blijft toegestaan", () => {
  const r = checkPrivacy({
    from: "rob.van.der.burgt@cz.nl",
    subject: "Kennismaking",
    text: "De praktijk verzorgt circa 3.750 patiënten in Donderberg.",
  });
  assertEquals(r.excluded, false);
});

Deno.test("databaseregel domein", () => {
  const r = checkPrivacy({ from: "iemand@voorbeeld.nl" }, [
    { soort: "domein", waarde: "voorbeeld.nl", actief: true },
  ]);
  assertEquals(r.excluded, true);
});

Deno.test("inactieve regel telt niet", () => {
  const r = checkPrivacy({ from: "iemand@voorbeeld.nl" }, [
    { soort: "domein", waarde: "voorbeeld.nl", actief: false },
  ]);
  assertEquals(r.excluded, false);
});

Deno.test("ongeldig patroon sluit uit", () => {
  const r = checkPrivacy({ from: "a@b.nl", text: "x" }, [
    { soort: "patroon", waarde: "([", actief: true },
  ]);
  assertEquals(r.excluded, true);
});
