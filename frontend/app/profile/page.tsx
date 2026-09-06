"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/family/authContext";
import { JalariLoading } from "../../components/ui/JalariLoading";

export default function ProfileIndexPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login?redirect=profile&reason=unauthenticated");
      return;
    }

    const rolePath = (user.role || "FAMILY").toLowerCase();
    if (rolePath === "family") {
      router.replace("/profile/family");
      return;
    }

    if (rolePath === "fisherman" || rolePath === "crew") {
      router.replace("/profile/fisherman");
      return;
    }

    if (rolePath === "operator" || rolePath === "rescuer") {
      router.replace("/profile/operator");
      return;
    }

    if (rolePath === "admin" || rolePath === "administrator") {
      router.replace("/profile/admin");
      return;
    }

    router.replace("/profile/family");
  }, [isLoading, router, user]);

  if (isLoading) {
    return <JalariLoading label="Loading your profile" />;
  }

  return null;
}
