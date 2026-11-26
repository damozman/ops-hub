# UAT: Phase 1 (CRM, tasks, collaboration, intake)

Run against a local stack after `npx supabase db reset` (README steps), or a preview build. All data is invented.
Times are shown in Central time.

## Chris (owner) and partner (operator), on two PCs at once

1. Both sign in and open **CRM** (Deals).
   - Expect: two boards, First Pass Data and 369 Agentic Systems, each with New lead → Contacted → Discovery booked →
     Proposal sent → Won / Lost.
2. Chris drags **Cowtown Diesel listing audit** to **Contacted** (or uses the card's "Move" menu).
   - Expect: the card moves on Chris's screen right away and on the partner's screen within a few seconds, without
     reloading.
3. The partner moves the same deal to **Proposal sent**.
   - Expect: Chris's board updates the same way.
4. Chris moves **Lone Star catalog cleanup** to **Won**, then opens the Lone Star company page.
   - Expect: a "Cross-sell suggestions" box with "Cross-sell: offer 369 local visibility to Lone Star…". It is a task
     only; no email or text exists anywhere.

## Collaboration

5. On the Lone Star page, Chris writes a comment: `@Partner (dev) can you call them this week?`
   - Expect: "Posted. Notified Partner (dev)." The partner's nav shows **Inbox (1)**; the mention is listed there.
6. The partner adds a task on the same page, assigned to Chris, due tomorrow, repeating weekly.
   - Expect: it appears under Tasks on the page and on Chris's **Tasks** page; Chris gets an inbox item.
7. Chris clicks **Done** on the task.
   - Expect: it leaves the open list.
8. Sign in as `viewer@example.test` and open the Lone Star page.
   - Expect: comments are visible, but there is no comment box ("Your role can read comments but not add them").

## Lead form

9. As Chris, open **Forms** (settings) and click the public link for "FPD listing audit request" in a private window.
   Fill it in **with** the consent box ticked and send.
   - Expect: "Thanks…". In the CRM there is a new contact (its Consent box shows `fpd-2026-11-v1`), a New lead deal
     on the FPD board, a follow-up task, and an inbox item for Chris.
10. Send the form again with a different email and **without** ticking consent.
    - Expect: the contact exists, and its Consent box says "No consent recorded."

## Contact import and the import guard

11. Open **CRM → Contacts → Import CSV**. Upload a CSV whose header row is
    `VENDOR_ITEM_NO,EXCH_DEPT,MFR_PART,UPC_CODE,RETAIL_PRICE` (the invented test template).
    - Expect: "Blocked: this file matches the protected template…". Nothing is imported or stored.
12. Upload a small CSV with `First Name,Last Name,Email,Phone,Company`, including one row whose email is already in the
    CRM (for example `dana@lonestar.example.test`).
    - Expect: the preview maps the columns; importing reports the duplicate as skipped.
13. (Later, with your real template) In **Settings → Import guard**, add your real catalog headers. Ops Hub stores
    only the header names, never a file.

## Bookings

14. On a contact page, paste a booking link (https://…) with a time.
    - Expect: it is listed under Bookings. Ops Hub does not contact your scheduling service.

## Brand limits

15. Sign in as `brandlimited@example.test` (369 only).
    - Expect: only the 369 board; no First Pass Data deals anywhere.

## Pass criteria

All "Expect" lines hold. Report anything else in the PR.
