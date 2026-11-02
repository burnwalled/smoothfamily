import { redirect } from "next/navigation";

// Family settings → Birthdays: people without an account are under Family members; a member's birthday on their page (3.0.4).
export default function Moved() {
  redirect("/settings/members#people");
}
