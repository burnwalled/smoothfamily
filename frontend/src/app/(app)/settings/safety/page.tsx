import { redirect } from "next/navigation";

// Family settings → Safety: the household's card and the pets' medicines are under Everyday; a member's on their page (3.0.4).
export default function Moved() {
  redirect("/settings/everyday#household");
}
