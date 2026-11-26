import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";

export default function NoAccess() {
  return (
    <main className="mx-auto mt-24 w-full max-w-md px-4">
      <Card>
        <CardTitle>No workspace yet</CardTitle>
        <CardDescription className="mt-2">
          Your account is signed in but is not an active member of any Ops Hub workspace. Ask the owner to invite you.
        </CardDescription>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </Card>
    </main>
  );
}
