import React, { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export function SupabaseAuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!supabase) {
      setMessage("Supabase Auth is not configured. Add the browser Supabase URL and anon key.");
      return;
    }
    setPending(true);
    try {
      const result = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: window.location.origin },
          });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage("Account created. Check your email to confirm the account, then sign in.");
        setMode("signin");
        return;
      }
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <Input
        type="email"
        autoComplete="email"
        placeholder="Email address"
        value={email}
        onChange={event => setEmail(event.target.value)}
        required
      />
      <Input
        type="password"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        placeholder="Password"
        minLength={6}
        value={password}
        onChange={event => setPassword(event.target.value)}
        required
      />
      {message ? <p className="text-xs leading-5 text-muted-foreground" role="status">{message}</p> : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Please wait…" : mode === "signin" ? "Sign in securely" : "Create Supabase account"}
      </Button>
      <button
        type="button"
        className="text-xs text-muted-foreground underline underline-offset-4"
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); }}
      >
        {mode === "signin" ? "Need a new account? Create one" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
