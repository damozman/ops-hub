import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function NotAllowed({ what }: { what: string }) {
  return (
    <Card>
      <CardTitle>Not allowed</CardTitle>
      <CardDescription className="mt-1">
        Your role can&apos;t open {what}. Ask an owner or admin if you need it.
      </CardDescription>
    </Card>
  );
}
