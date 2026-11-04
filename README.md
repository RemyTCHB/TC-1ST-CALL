<div align="center">

<img src="icon.svg" alt="TC Checklist" width="120" height="120" />

# TCHB TC Checklist

### A real-time first-call checklist for the Total Cash Home Buyers Transaction Coordination team

A guided, synced, installable checklist that walks Transaction Coordinators through every question to ask on the first call with a seller — so nothing gets missed, and progress is shared live across the team.

<br/>

![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Firestore](https://img.shields.io/badge/Firestore-FF8F00?style=for-the-badge&logo=firebase&logoColor=white)
![Google Auth](https://img.shields.io/badge/Google%20OAuth-4285F4?style=for-the-badge&logo=google&logoColor=white)
![JavaScript](https://img.shields.io/badge/Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)

</div>

---

## 📌 Overview

**TCHB TC Checklist** is an internal tool for the Total Cash Home Buyers (TCHB) Transaction Coordination team. During a seller's first call, the coordinator works down a structured checklist covering everything that needs to be asked and confirmed — mortgage details, photos, emergency contacts, HOA specifics, property-type questions, and more. Every checkbox is synced in real time through Firebase, so the call's progress is visible to the whole team, survives a refresh or device switch, and can be printed or reset for the next call.

The app is an installable **Progressive Web App** with offline support, so it loads instantly and keeps working even on a flaky connection in the field.

---

## Help And Guides

In the app: click your photo → **Help**. Like the Universal Team Hub's Help, it opens the guide for the person's role
inside the app, with a contents list: the **Team Guide** (Members), the **Team Leader Guide** or the **Manager Guide**.
Roles come from the Team Hub's directory; anyone not in it counts as a Member. **PDF** downloads the same guide
(`guides/TC_Checklist_Team_Guide.pdf`, `..._Team_Leader_Guide.pdf`, `..._Manager_Guide.pdf`).

Team Leaders and Managers also see the delete passwords they may use. The page fills that table from `/api/passwords`
after sign-in; the passwords are never written into `help/guides.json`, the PDFs or this repository.

Everything is built from one script: `python3 docs/guide/build_guide.py` writes the three PDFs and `help/guides.json`
(+ `help/img/`). Screenshots come from the app on the local emulators with made-up data:
`cd tests && node run.mjs guide-shots.mjs`.

## Moving Between Properties

On a property, **Previous**, **Jump To · 3 of 26** and **Next** step through the list it was opened from (the same tab,
search and order as the Properties page), fixed when it opened so saving an answer doesn't reorder it. Opened from a
link, it uses that property's own tab. Jump To is a searchable list; Enter opens the first match.

## Header

The header follows the Universal Team Hub's header standard (hub repo, `docs/HEADER.md`): a 1280px page with 24px
sides (16px on phones), the logo and one **Live clock** (Eastern time from the server, coloured by the save status;
click it for the details, Retry Now or OK), then Active, light/dark and the photo menu (My Settings, Help, Sign Out).
It slims when scrolled, and the Open / Closed / Cancelled tabs line pins under it. On phones (under 640px) it is one row
(logo, time, photo) and Active and light/dark move into the photo menu. Checks and screenshots for every width, both
themes and all three roles, with made-up data: `cd tests && node run.mjs header-shots.mjs` (`VERBOSE=1` shows the
emulator output).

## Login As User (Remy Only)

Like the Team Hub: the photo menu has **Team Members** for managers (who's on the team, from the hub's directory,
read-only here: roles and departments are changed in the Team Hub). Remy (systems@totalchb.com) gets **Login As User**
on each person there, and sees and works in TC Checklist exactly as that person does (their role, Help, passwords and delete rights). An amber bar shows
"Viewing TC Checklist as …" with **Back To Remy**. `api/login-as.js` checks Remy's sign-in and signs him in as them with a
one-time Firebase sign-in marked `imp` (never from a borrowed sign-in); `{ back: true }` returns him without Google.
While viewing as someone, saves add `updatedVia` (Remy's email) next to `updatedBy`, and the property shows "(via …)";
the next ordinary save removes it. Presence isn't written for them. The person must have signed in once.

Vercel setting (name only): `TC_FIREBASE_SERVICE_ACCOUNT`, the whole JSON key of a service account in the
`tc-1st-call-checklist` Firebase project. Without it, Login As User answers "not set up yet" and nothing else changes.
It's the only function that needs a package (`firebase-admin`, in `package.json`).

## Deleting A Property

Deleting follows the Team Hub's rules and uses its delete passwords (owner, 2026-11-03): Remy confirms; anyone with their
own delete password uses it; Managers and Team Leaders who see TC use the **TC Team Leader password**; Members can't
delete and are offered **Mark Cancelled** instead. The page asks `/api/delete-check`, which checks the person's sign-in
and asks the hub (`/api/tc-checklist/delete-check`, signed with `HUB_SYNC_SECRET`). The passwords live only in the
hub's `HUB_DELETE_PASSWORDS` setting. The check happens on the server before the page deletes (the owner chose a page
check; the database rules themselves still allow deletes).

## What It Does

- **Properties home**: every property as a card, with **Open / Closed / Cancelled** tabs and a search across addresses, CRM links and answers. Each card shows its status, how many questions are checked, when it was last updated and by whom, and an Open In CRM button.
- **The first-call checklist**: Mortgage Questions, Pictures, Emergency Contact Info, HOA Questions, SFHs, Land, Income Producing Properties and Mobile Homes, each with a check and an answer box per question.
- **Live for the whole team**: changes appear on every open screen as they're typed, and each answer is saved on its own, so two people can work on the same property without overwriting each other. Failed saves show **Not Saved** and retry.
- **Status**: every property starts Open. Mark Closed or Cancelled to make it view-only; Reopen brings it back. Each change is logged with who and when (Activity).
- **Print / PDF**: every answer in full, with the property details at the top.
- **Universal Team Hub design**: TCHB colours, light and dark, phone-ready, Eastern-time clock from the server, names from the hub's team directory.
- **Installable app** that always loads the newest version, with the last copy available offline.

## How It's Built

| Piece | What |
|-------|------|
| `index.html` | The whole app: plain JavaScript, the hub's styles inline, Firebase 12.15.0 (Auth + Firestore) |
| `service_worker.js` | Network first, saved copy when offline; replaces the old v1 worker that kept devices on old versions |
| `api/team.js` | Vercel function: checks the person is signed in (verified @totalchb.com), then gets names from the hub's `/api/title-agent/team` |
| `vercel.json` | Always-fresh page and worker; basic headers |
| `firebase/` | Firestore rules: `firestore.rules` (proposed, @totalchb.com only) and `firestore.rules.current` (live today). Not deployed by Vercel. |
| `tests/` | Local checks against the Firebase emulators with made-up data. Not deployed by Vercel. |

Vercel deploys `main` to tc.totalchb.com.

**Vercel settings (names only):** `HUB_SYNC_SECRET` (TC Checklist's own secret; the same value as the hub project's `TC_CHECKLIST_SYNC_SECRET`); optional `HUB_TEAM_DEPTS`, which departments' names come over from the hub, comma separated from `TC, DISPO, ACQ, OPS` (default `TC,DISPO`; Managers always come over; takes effect on the next deploy); optional `HUB_TEAM_URL` and `HUB_URL` (default https://hub.totalchb.com). Without the secret the app shows names from email addresses, everyone counts as a Member, and deleting is unavailable.

## Data (do not change)

Firestore, project `tc-1st-call-checklist`, under `artifacts/tchb-checklist-live/public/data/`:

- `checklists/{id}`: the ID is the address, `encodeURIComponent(address)` with `.` as `%2E`. Fields: `address`, `crmLink`, `checks.chk_0`–`chk_78` (true/false), `answers.ans_0`–`ans_80` (text), `updatedAt` (ISO text). Added in v2 (optional): `updatedBy`, `status` (`open`/`closed`/`cancelled`; missing means open), `statusAt`, `statusBy`, `statusLog[]` (`{status, at, by}`).
- `active_users/{uid}`: `email`, `sessions.{deviceId}.lastActive` (ms) and `.type` (`Mobile`/`Desktop`).

**The `chk_`/`ans_` numbers are positions in the checklist.** Never reorder, insert or remove a question. Add new ones only at the very end. `tests` checks this against the original page.

Browser storage: `tchb_device_id`, `tchb_unsaved_draft` (from v1; offered when creating a property), `tchb-checklist-theme`, `tchb-checklist-clock`, `tchb-checklist-team`.

## Checks

```bash
cd tests && npm install && npm test
```

The checks start the Firebase emulators (demo project, made-up data; never the live database). They cover the data contract, the rules, two people editing at once, every action, print, presence, the app-update path, the hub-names function, and screenshots in light and dark at desktop and phone width (`tests/out/`, not committed).

---

## 📄 License

Internal proprietary tool — © Total Cash Home Buyers. All rights reserved.

<div align="center">
<br/>
<sub>Built for the TCHB Transaction Coordination team 📋</sub>
</div>
