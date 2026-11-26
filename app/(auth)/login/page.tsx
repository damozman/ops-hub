import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto mt-24 w-full max-w-sm px-4">
      <Card>
        <CardTitle className="text-lg">Sign in to Ops Hub</CardTitle>
        <CardDescription className="mb-5 mt-1">We&apos;ll email you a one-time link. No passwords.</CardDescription>
        <LoginForm />
      </Card>
    </main>
  );
}
