# Phase 1 — Account and onboarding model

This document describes the K–5 expansion onboarding behavior implemented on `feature-k5-expansion`.

## Entry points

### Student

The main Number Ninja page is the student entry point.

Students choose one of two modes:

- **Returning Student** — username + 4-digit PIN. This is a read/authentication path and does not create an account if the username does not exist.
- **Create Student** — globally unique username + 4-digit PIN + home grade (Kindergarten through Grade 5).

Existing pre-K–5 Number Ninja accounts continue to work and are treated as Grade 4 when no grade controls exist. Existing game progress is not reset.

### Parent

Parents use `/family.html` (Parent Dojo). Parent accounts use the same credential style as students: a globally unique username + 4-digit PIN, but the account is explicitly stored as `accountType: "parent"`.

Parent Dojo uses `/api/parent-login` for login so a typo can never trigger the legacy student auto-create behavior.

Parent Dojo automatically locks after **2 minutes of inactivity**. Re-entry requires the parent PIN again.

## Child creation and linking

A parent can:

- create a new child with a globally unique username, 4-digit PIN, and K–5 home grade;
- link an existing standalone student using that student's username + current PIN;
- manage multiple linked students;
- reset a linked child's PIN;
- rename a linked child while preserving progress;
- unlink a child without deleting the child account or progress.

A student may be linked to only one parent account at a time. Another parent cannot link the student until the current parent unlinks them.

## Data ownership

Student game saves remain in `record.data`.

Parent-controlled settings live in `record.controls`, outside the student-writable save payload. This prevents a child game save from overwriting parent choices such as:

- home grade;
- above-grade automatic unlocking;
- spoken-instruction preference;
- skill overrides;
- future goals, assignments, notes, and placement settings.

## Grade defaults

- New students receive the grade selected at creation.
- Kindergarten and Grade 1 default spoken instructions to ON.
- Grades 2–5 default spoken instructions to OFF.
- Existing legacy students with no grade metadata are treated as Grade 4.
- `allowAboveGrade` defaults to ON.

## Regression coverage

`phase1test.js` covers the primary Phase 1 contract:

- K–5 student creation and grade defaults;
- parent/student global username collisions;
- parent-only authentication;
- no account creation on mistyped parent login;
- parent-created children;
- linking and unlinking existing students;
- progress preservation;
- legacy Grade 4 compatibility;
- onboarding UI and 2-minute lock configuration checks.
