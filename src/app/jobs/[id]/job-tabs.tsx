"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function JobTabs({
  defaultValue,
  tabs,
}: {
  defaultValue: string;
  tabs: { value: string; label: string; icon: React.ReactNode; count?: number; content: React.ReactNode }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = React.useState(params.get("tab") ?? defaultValue);
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        setValue(v);
        const next = new URLSearchParams(params);
        next.set("tab", v);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    >
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.icon}
            {t.label}
            {t.count !== undefined ? <span className="tnum rounded bg-muted px-1 text-[10px] text-muted-foreground">{t.count}</span> : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
