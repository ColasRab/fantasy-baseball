"use client";

import { useEffect, useState } from "react";
import {
  getSupabaseAuthUser,
  isSupabaseConfigured,
  saveAuthUser,
  signInWithPassword,
  signUpWithPassword,
  type AuthUser,
} from "../lib/auth";

type LoginMode = "signin" | "create";

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("signin");
  const [managerName, setManagerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    getSupabaseAuthUser().then((user) => {
      if (!user) return;
      saveAuthUser(user);
      window.location.href = "/office";
    });
  }, []);

  function finishLogin(user: AuthUser) {
    saveAuthUser(user);
    window.location.href = "/office";
  }

  function validateFields() {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) return "Enter a valid email address.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (mode === "create" && managerName.trim().length < 2) return "Enter a manager name.";
    return "";
  }

  async function submit() {
    setStatus("");
    const validationError = validateFields();
    if (validationError) {
      setStatus(validationError);
      return;
    }

    const normalized = email.trim().toLowerCase();
    if (mode === "signin") {
      const result = await signInWithPassword(normalized, password);
      if (result.error) setStatus(result.error);
      else if (result.user) finishLogin(result.user);
      return;
    }

    const result = await signUpWithPassword(normalized, password, managerName.trim());
    if (result.error) {
      setStatus(result.error);
      return;
    }
    if (result.user && !result.needsConfirmation) {
      finishLogin(result.user);
      return;
    }
    setStatus("Manager account created. Check your email if Supabase requires confirmation, then sign in.");
    setMode("signin");
  }

  function devSignIn() {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) {
      setStatus("Enter an email for the local manager profile.");
      return;
    }
    finishLogin({
      email: normalized,
      name: managerName.trim() || normalized.split("@")[0],
      provider: "dev",
    });
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Manager account</p>
        <h1>{mode === "signin" ? "Sign In" : "Create Manager"}</h1>
        <p className="team-story">
          Use a manual email and password login. Your manager name is saved to the Supabase user profile.
        </p>

        <div className="login-mode">
          <button className={mode === "signin" ? "is-active" : ""} onClick={() => setMode("signin")} type="button">
            Sign In
          </button>
          <button className={mode === "create" ? "is-active" : ""} onClick={() => setMode("create")} type="button">
            Create Manager
          </button>
        </div>

        <div className="dev-login">
          {mode === "create" ? (
            <>
              <label htmlFor="manager-name">Manager Name</label>
              <input
                id="manager-name"
                onChange={(event) => setManagerName(event.target.value)}
                placeholder="Skip Ledger"
                type="text"
                value={managerName}
              />
            </>
          ) : null}

          <label htmlFor="manager-email">Email</label>
          <input
            id="manager-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="manager@example.com"
            type="email"
            value={email}
          />

          <label htmlFor="manager-password">Password</label>
          <input
            id="manager-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
            type="password"
            value={password}
          />

          {supabaseReady ? (
            <button onClick={submit} type="button">
              {mode === "signin" ? "Sign In" : "Create Manager"}
            </button>
          ) : (
            <span className="login-status">Set Supabase env vars to enable database login.</span>
          )}
          <button onClick={devSignIn} type="button">Use Local Dev Profile</button>
        </div>

        {status ? <p className="login-status">{status}</p> : null}
      </section>
    </main>
  );
}
