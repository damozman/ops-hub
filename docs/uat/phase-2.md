# UAT: Phase 2 (jobs, stage gates, checks, approvals, outbox)

Run against a local stack after `npx supabase db reset` (README steps), or a preview build. All data is invented.
Chris is `owner@example.test`; the partner is `partner@example.test` (operator). Two browsers (or one normal and one
private window) make the two-person steps easy.

## Job A: Bluebonnet Amazon listing refresh (First Pass Data)

1. The partner opens **Jobs**.
   - Expect: a board with columns Intake → Audit → Drafts → Review → Approved → Delivered → Upkeep, and two cards:
     "Bluebonnet Amazon listing refresh" (First Pass Data) and "Trinity Paws Google profile tune-up" (369).
2. Open the Bluebonnet job. The stage bar shows **Intake** and a "Move to audit" button with blockers listed under it.
   - Expect: "Move to audit" is refused until the intake list is complete; the blockers name each missing item.
3. On **Intake**, click **Mark done** on all six items (scope, brand, sensitivity, access, owner contact, contract).
   Then **Move to audit**.
   - Expect: the stage changes to Audit. **Activity** shows the move with who and when.
4. On **Audit**, click **Start a manual audit**, add a finding ("Titles miss the scent name"), then **Finish audit**.
   **Move to drafts**.
   - Expect: a finished audit can't be edited; the move succeeds.
5. On **Drafts**, create a Listing draft for "Texas Wildflower soy candle, 8 oz". Enter a title, two bullets
   ("About 45 hours of burn time", "Hand-poured in small batches") and a description. **Save version**.
   - Expect: "New version saved. Checks ran." Status **ready for review**.
6. Create a second Listing draft for "Cedar & Sage soy candle, 12 oz" with a bullet "Load capacity 5,000 lb" and the
   description "Guaranteed #1 ranking on Google." **Save version**.
   - Expect: status **checks failed**. The checks list shows `spec.fidelity` (5,000 isn't in the item's spec data)
     and `claims.guaranteed`, with the offending words highlighted.
7. Fix the bullet and description and save again.
   - Expect: version 2, a word-level diff against version 1 (removed words struck through, added words highlighted),
     status **ready for review**. **Move to review**.
8. The partner opens either draft.
   - Expect: "Two-person rule: you wrote this version, so someone else approves it." No Approve button.
9. Chris opens **Review queue**, then each draft, and clicks **Approve this version**.
   - Expect: status **approved**; the approval shows Chris, the time and the version's hash. The job's stage bar no
     longer lists G4 blockers. **Move to approved**.
10. Chris edits one bullet on the Wildflower draft and saves.
    - Expect: the approval history marks the old approval **stale**; the job is back in **Drafts**, and Activity
      says "content changed after approval". Approvals always belong to an exact version.

## Outbox (nothing is ever sent by the app)

11. The partner opens **Outbox**, picks First Pass Data, enters a recipient and message, and clicks
    **Add outbox item**.
    - Expect: status **pending approval**; the partner's Approve button is disabled (they wrote it).
12. Chris clicks **Approve** on it.
    - Expect: status **approved**. On the partner's screen: "Waiting for someone who can release it" (operators
      can't release unless the org setting allows it).
13. Chris copies the message, sends it himself outside the app, then clicks **I sent it: mark sent**.
    - Expect: status **sent**, with Chris as sender and "manual" as the provider. Editing an approved item before
      release puts it back to pending approval.

## Checks settings

14. Chris opens **Settings → Checks**.
    - Expect: the rule packs (required fields, length, banned claims, spec fidelity, reviews, review replies, Google profile, SMS, email,
      honesty, data safety) with severity and
      version. Change one rule's severity for this org and save: the rule's version goes up and new check runs
      record the new rules version.

## Job B: Trinity Paws Google profile tune-up (369), manual

15. Walk Job B through intake → audit → drafts with a "Google profile description" draft. Try a description over
    750 characters, and one containing a phone number or URL.
    - Expect: a length **blocker** for the long text, and a **warning** for the phone number or URL. Warnings don't
      block review, but the approver must tick "I read the warning(s)" before approving.

## Brand limits

16. Sign in as `brandlimited@example.test` (369 only).
    - Expect: only the Trinity Paws job on the board. Opening the Bluebonnet job's address gives "not found".
