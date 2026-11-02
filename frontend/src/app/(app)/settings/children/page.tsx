import { redirect } from "next/navigation";

// Family settings → Children: the points' rules are under Everyday; each child's allowance, little ones' mode and two homes on their page (3.0.4).
export default function Moved() {
  redirect("/settings/everyday#points");
}
