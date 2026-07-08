"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getSupabaseAuthUser,
  isSupabaseConfigured,
  saveAuthUser,
  signInWithGoogle,
  signInWithMagicLink,
  type AuthUser,
} from "../lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    getSupabaseAuthUser().then((user) => {
      if (!user) return;
      saveAuthUser(user);
      window.location.href = "/office";
    });
  }, []);

  function finishDevLogin(user: AuthUser) {
    saveAuthUser(user);
    window.location.href = "/office";
  }

  async function googleLogin() {
    setStatus("");
    const result = await signInWithGoogle();
    if (result.error) setStatus(result.error);
  }

  async function magicLinkLogin() {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) {
      setStatus("Enter an email address.");
      return;
    }
    const result = await signInWithMagicLink(normalized);
    setStatus(result.error ? result.error : "Check your email for the Supabase sign-in link.");
  }

  function devSignIn() {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) {
      setStatus("Enter an email for the local manager profile.");
      return;
    }
    finishDevLogin({
      email: normalized,
      name: normalized.split("@")[0],
      provider: "dev",
    });
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Supabase manager profile</p>
        <h1>Sign In</h1>
        <p className="team-story">
          Supabase Auth binds your Diamond Manager save to your email. Game progress syncs to the `manager_saves` table after sign-in.
        </p>

        <div className="oauth-box">
          {supabaseReady ? (
            <button className="wide-auth-button" onClick={googleLogin} type="button">
              Continue with Google via Supabase
            </button>
          ) : (
            <span>Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to enable Supabase.</span>
          )}
        </div>

        <div className="dev-login">
          <label htmlFor="manager-email">Email</label>
          <input
            id="manager-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="manager@example.com"
            type="email"
            value={email}
          />
          {supabaseReady ? <button onClick={magicLinkLogin} type="button">Send Magic Link</button> : null}
          <button onClick={devSignIn} type="button">Use Local Dev Profile</button>
        </div>
        {status ? <p className="login-status">{status}</p> : null}
        <Link className="back-link" href="/office">Continue as guest</Link>
      </section>
    </main>
  );
}
