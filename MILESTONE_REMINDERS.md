# PayMind milestone reminders

## What is included

- A notification bell in the global header with an unread count and an in-app reminder feed.
- Default reminders at 3, 2, and 1 days before a milestone deadline. Due-day and 7-day reminders are available as optional switches.
- Custom reminder offsets from 0 to 90 days. Users can remove custom offsets and disable reminders.
- An optional browser/desktop notification after the user grants browser permission.
- Role-aware reminder text for freelancers/sellers and clients/buyers.
- Settings and read/unread state stored in local storage, scoped separately by signed-in account (or local demo mode).

## Account data

- A signed-in freelancer receives reminders for their own milestones through Supabase Row-Level Security.
- A signed-in client needs a confirmed email address that matches the email saved in the freelancer's client contact record. The client reminder endpoint only returns project titles and milestone deadline/status information for those matching contacts.
- In local development without a signed-in account, sample milestones are used to demonstrate the reminder behavior.

## Requested communication workflows (audit)

Part 2 of the brief requests milestone communication actions (small-change requests, more time, revised deadlines, “unable to complete”, future contact, communication history tied to project/milestone). **The current implementation does not provide a dedicated milestone communications API, database table, or UI history for these actions.** The reminders and preview portal cover deadline awareness and demonstration/inspection consent flows; adding those communication workflows would require new schema, server routes, authorization, and UI. Treat as a **known limitation / not implemented** in release reporting unless explicitly added in a future, scoped change.

The app checks deadlines while the PayMind application is open (one-minute refresh). Browser notifications require permission and the browser to be running. There is no service-worker push subscription or scheduled background worker in this version, so reminders are not sent while the app is fully closed. Preferences and notification history are local to that browser/device and are not synchronized between devices.

The reminder explains when a phase is approaching and prompts the client to raise any agreed change request or the seller to discuss delivery risk/extra time early. This version does not create a new change-request message or send a message to the other party automatically.
