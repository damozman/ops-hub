# UAT: Phase 0 (foundation)

Run against a local stack (README steps 1-7) or a preview build. Uses invented data only.

## Chris (owner), on your PC

1. Open the app, enter your seed email, and click the link in the mail catcher (http://127.0.0.1:54324).
   - Expect: you land on "Turn on two-step sign-in".
2. Try to skip it: go to `/mosley-dev/dashboard` directly.
   - Expect: you're sent back to the MFA page.
3. Set up your authenticator app, enter the code.
   - Expect: dashboard shows **First Pass Data** and **369 Agentic Systems**, role badge says `owner`.
4. Use the Brand switcher to pick 369, then All brands.
   - Expect: the dashboard narrows to one brand, then shows both again.
5. Open **Members**. Invite `test-invite@example.test` as viewer.
   - Expect: "Invited …" message; the email appears in the mail catcher; the person shows as `invited`.
6. Try to change your own role from owner to admin and save.
   - Expect: "An org must keep at least one active owner".
7. Open **Org settings**, untick "Operators can approve drafts", save, reload.
   - Expect: the box stays unticked.
8. Sign out, sign back in.
   - Expect: you're asked for a 6-digit code (not a new enrollment).

## Partner (operator), on her own PC

1. Sign in with the partner seed email and set up an authenticator app.
2. Expect: dashboard loads; there is **no** Members or Org settings link.
3. Go to `/mosley-dev/settings/members` directly.
   - Expect: "Not allowed".
4. Open **Brands**.
   - Expect: fields are read-only and there's no Save button.

## Pass criteria

All "Expect" lines hold on both PCs. Report anything else in the PR.
