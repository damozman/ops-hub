import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export default function AuthError() {
  return (
    <main className="mx-auto mt-24 w-full max-w-sm px-4">
      <Card>
        <CardTitle>That link didn&apos;t work</CardTitle>
        <CardDescription className="mt-2">
          Sign-in links expire after 15 minutes and work once, in the same browser that asked for them.
        </CardDescription>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary underline">
          Get a new link
        </Link>
      </Card>
    </main>
  );
}
