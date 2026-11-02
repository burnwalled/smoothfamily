"use client";

import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import RecipeBook from "@/components/recipes/RecipeBook";
import { useI18n } from "@/lib/i18n";

export default function RecipesPage() {
  const { t } = useI18n();
  return (
    <>
      <PageTitle title={t("nav.recipes")} icon={BookOpen} />
      <div className="mt-4">
        <Suspense>
          <RecipeBook />
        </Suspense>
      </div>
    </>
  );
}
