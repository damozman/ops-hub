import { Alert } from "@/components/ui/card";

export function FormStatus({ state }: { state: { status: string; message?: string } }) {
  if (state.status === "ok") return <Alert tone="success">{state.message}</Alert>;
  if (state.status === "error") return <Alert tone="error">{state.message}</Alert>;
  return null;
}
