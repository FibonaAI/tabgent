# Tabgent use cases and validation plan

**English** · [简体中文](use-case-research.zh-CN.md)

Tabgent should first be tested on necessary browser tasks that involve repeated searching, checking and form filling. Invoice collection, job applications and rental comparisons are the proposed first trials: each has a concrete goal and a result that can be checked.

**Status: all seven use cases await end-to-end testing.** The linked discussions show people experiencing these problems. The sample requests, workflows and success criteria below are proposed product designs, not user quotations or claims that Tabgent supports the complete workflow. The order reflects repetition, browser suitability and verifiable outcomes, not market size or willingness to pay.

## Proposed validation order

| Order | Use case                                        | Desired outcome                                     | Reason to test                                                      |
| ----- | ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| 1     | Collect monthly invoices                        | Original files, a summary and a missing-items list  | Recurring work with concrete download and organization results      |
| 2     | Fill a job application                          | A completed form and questions needing confirmation | Repeated data entry tests the path from document to form            |
| 3     | Organize rental candidates                      | A sourced comparison and unresolved questions       | Scattered information can be tested on public listings              |
| 4     | Plan a child's holiday activities               | A feasible weekly plan and uncovered dates          | Age, dates, transport and budget must fit together                  |
| 5     | Organize college and scholarship applications   | Deadlines, requirements and missing materials       | Easily missed requirements need accurate checking                   |
| 6     | Prepare a flight refund or compensation request | A timeline, evidence and an application draft       | Concrete user loss, but outcomes depend on rules and human handling |
| 7     | Cancel an unwanted subscription                 | A clear cancellation status and confirmation        | Clear intent, but some processes require phone support              |

## Collect monthly invoices

**User and trigger:** A freelancer, small-business owner or employee gathers expenses from several services at month end.

**Reported problem:** One user manually signs in to telecom, mobile and software services every month to download and file invoices. A Chinese discussion also describes the burden of finding invoice attachments among many emails. [Manual invoice download request](https://www.reddit.com/r/Automate/comments/1e5eqbb/) · [Chinese invoice discussion](https://v2ex.com/t/698310)

**Sample request:**

> Download last month's invoices from these accounts into one folder. Name them by date and supplier, summarize the amounts, and list anything missing. Do not substitute a billing-page screenshot for an invoice.

**Inputs:** A supplier or account list, exact date range, destination folder and signed-in pages. If email is included, the user specifies the mailbox and search scope.

**Proposed workflow:**

1. Confirm accounts and dates, then find each billing or invoice section.
2. Download originals and retain invoice number, date, supplier, amount, currency and source; distinguish bills, receipts and invoices.
3. Check duplicates, create a summary, and separately list unavailable, unissued or inaccessible items.

**Success criteria:** Files open correctly; the summary matches the originals; currencies are totaled separately; every requested account has a clear retrieved or unresolved status. Compare against a manually checked file list for omissions, duplicates and amount errors, and record user interventions and elapsed time.

**Exceptions and limits:** The user handles authentication challenges. Report failed downloads without inventing documents or amounts. This task collects records rather than determining reimbursement or tax eligibility; the first trial does not include unattended monthly scheduling.

## Fill a job application

**User and trigger:** A job seeker has chosen a role and opened its multi-step application form.

**Reported problem:** Applicants describe re-entering experience after uploading a resume, correcting parsing errors, and losing substantial work when a form times out. [Workday application discussion](https://www.reddit.com/r/recruitinghell/comments/1wukakh/workday_is_a_plague/)

**Sample request:**

> Fill this application using my uploaded resume. Keep the experience and dates accurate, and ask me about anything missing. Let me review the completed form before submitting.

**Inputs:** The user's resume, the current job page, and personally confirmed answers such as contact details and work authorization.

**Proposed workflow:**

1. Read the role and form requirements, then map resume information to fields.
2. Fill and check experience, education, dates and attachments, correcting parsing errors.
3. Ask the user about unsupported answers and present the completed fields and unresolved items for review.

**Success criteria:** Supported information is entered accurately; required fields are filled or explicitly awaiting confirmation; no experience, skills or personal declarations are invented; the workflow stops before submission. Record corrected fields, user interventions and elapsed time.

**Exceptions and limits:** If saving, uploading or navigation fails, report exactly which steps completed. Start with one application rather than bulk applications. Do not guess sensitive identity information or make eligibility declarations on the user's behalf.

## Organize rental candidates

**User and trigger:** A renter has opened several listings and wants to eliminate unsuitable options before contacting landlords or arranging viewings.

**Reported problem:** Users build spreadsheets to track properties and amenities; commenters describe feeling overwhelmed by organizing the information. [Apartment tracking discussion](https://www.reddit.com/r/ApartmentHacks/comments/1anz4o8/apartment_hunting_spreadsheet/)

**Sample request:**

> Compare these listings against my budget, move-in date, commute and pet requirements. Include charges beyond rent, mark anything unclear, and list what I should ask before contacting the landlords.

**Inputs:** Listing links, budget and currency, move-in date, commute endpoints and travel mode, and mandatory requirements.

**Proposed workflow:**

1. Read listing details for charges, lease terms, amenities, pet conditions and availability dates.
2. Separate monthly and one-time costs, retaining offer conditions and source links; check commute estimates where available.
3. Flag failed requirements, missing information and remaining candidates, then prepare questions for the landlords.

**Success criteria:** Each candidate retains its source; unknown charges are not treated as zero; budget and requirement filtering can be checked; commute estimates state travel mode and query conditions. Check the source pages for transcription errors and missed conditions.

**Exceptions and limits:** Mark unconfirmed availability and undisclosed fees as unresolved. A comparison does not establish that a listing is genuine. Contacting landlords, paying fees and submitting applications are outside this comparison task.

## Plan a child's holiday activities

**User and trigger:** A parent needs several weeks of camps or holiday activities that fit work and pickup arrangements.

**Reported problem:** Parents describe checking multiple sites, coordinating calendars and spreadsheets, and tracking registration. One discussion reports that AI research became stale while programs were published at different times. [Parent registration difficulties](https://www.reddit.com/r/askTO/comments/1umndsq/how_do_you_manage_booking_childrens_summer_camps/) · [Feedback after trying AI research](https://www.reddit.com/r/eastbay/comments/1qerfrq/how_do_you_plan_for_summer_camp/)

**Sample request:**

> Compare these activities using my child's age, holiday dates, pickup times and budget. Build a weekly plan and show uncovered dates, extra care charges and registration links. Do not register yet.

**Inputs:** Activity pages, the child's age, dates to cover, location and transport constraints, budget, and necessary activity requirements.

**Proposed workflow:**

1. Read age limits, session dates, daily hours, location, price and registration status.
2. Include extended-care costs where needed and check schedule conflicts and uncovered dates.
3. Produce a weekly plan, alternatives, registration links and outstanding questions.

**Success criteria:** The plan meets known mandatory requirements; gaps and conflicts remain visible; prices, dates and registration status have sources and a checked date; sold-out or waitlisted sessions are not described as available.

**Exceptions and limits:** Leave unpublished information unknown rather than substituting last year's schedule. Recheck changing availability. The trial does not include ongoing monitoring, registration or payment, and does not promise to secure places.

## Organize college and scholarship applications

**User and trigger:** An applicant is preparing several applications and needs to establish eligibility and missing materials.

**Reported problem:** An applicant tracking more than twenty scholarships describes confusing essay requirements, deadlines and submission status. Others rely on several spreadsheets and weekly checklists. [Application requirements and deadline discussion](https://www.reddit.com/r/scholarships/comments/1p5fi86/how_do_you_guys_organize_all_your_scholarship/)

**Sample request:**

> Compare these official program requirements with my documents. List eligibility, deadlines, essay prompts and word limits. Sort by the earliest deadline and tell me what each application still needs.

**Inputs:** Official program links, application year, the applicant's background and prepared files; the user supplies eligibility details that cannot be established.

**Proposed workflow:**

1. Verify the application year, eligibility, materials, essays and distinct deadlines.
2. Match available documents to requirements, separating prepared, missing and user-confirmation items.
3. Create a deadline-ordered checklist with official sources and application links.

**Success criteria:** Dates distinguish applications, scholarships and recommendations and preserve published time zones; missing items trace to specific requirements; a prepared file is not treated as submitted, nor a submission as accepted.

**Exceptions and limits:** Show conflicting official information or uncertain eligibility rather than declaring the applicant qualified. Do not invent experience or recommendation letters, or promise an award. Reminders and continued status monitoring need separate validation.

## Prepare a flight refund or compensation request

**User and trigger:** A traveler experiences a delay, cancellation or missed connection and needs to organize accurate facts and supporting documents.

**Reported problem:** A traveler reports arriving a day late but receiving a response describing a delay under three hours, and wonders whether the wrong flight leg was selected. Another describes difficulty finding complaint evidence and the appropriate escalation route. [Flight-leg form question](https://www.reddit.com/r/Lufthansa/comments/1v1jky7/question_about_compensation_form/) · [Complaint documentation difficulties](https://www.reddit.com/r/Ryanair/comments/1wm6fmz/finally_got_compensation_for_my_delayed_flight/)

**Sample request:**

> Build a timeline from my itinerary, airline notices and receipts. Find the official application route, list missing evidence and prepare a form draft. Let me check it before submission.

**Inputs:** The full itinerary, booking details, scheduled and actual arrival times, airline notices, relevant receipts and existing correspondence.

**Proposed workflow:**

1. Distinguish individual legs from the final destination and build an evidence-backed timeline.
2. Check current official procedures for the relevant jurisdiction and airline, distinguishing refunds, expense reimbursement and compensation.
3. Prepare documents and draft fields, marking missing evidence and unresolved questions.

**Success criteria:** Facts trace to the user's documents; flight-leg delay is not confused with final-arrival delay; the request type and official route are clear; missing information and uncertainty remain visible for review.

**Exceptions and limits:** Do not infer an unproven cause of delay, use forum replies as eligibility rules, or guarantee payment or amounts. Phone negotiations, later appeals and legal determinations are outside the first browser workflow trial.

## Cancel an unwanted subscription

**User and trigger:** A user decides to stop renewal and wants to know whether cancellation succeeded and whether charges remain.

**Reported problem:** Users describe missing online cancellation options, unavailable live chat and long phone waits. [Subscription cancellation discussion](https://www.reddit.com/r/mildlyinfuriating/comments/1sxedfi/on_hold_for_a_fucking_hour_trying_to_cancel_a/)

**Sample request:**

> Find this subscription's cancellation option. First explain the effective date, remaining access and any charges shown. After I confirm, cancel it and save the confirmation.

**Inputs:** The specified service, the signed-in account and the actual purchase channel, such as the website or an app store.

**Proposed workflow:**

1. Establish who manages the subscription and locate the corresponding cancellation process.
2. Read the effective date, charges and access changes, and obtain the review requested by the user.
3. After confirmation, carry out the cancellation, check account status and save the page or email confirmation.

**Success criteria:** Clearly distinguish cancelled, renewal disabled, request submitted and support still required; status or evidence supports the result; clicking a button alone does not establish completion.

**Exceptions and limits:** When phone or in-person contact is required, provide the located contact route and necessary information, and report the task as incomplete. Do not substitute a fabricated address, payment blocking or account deletion for cancellation.

## First trials and README selection

Limit each trial to real websites, authorized accounts or public pages, and a clear stopping point. Check the stated success criteria and record a manual baseline, assistant elapsed time, user interventions, errors and unresolved items. Do not assume a time-saving percentage.

- **Invoice collection:** Use authorized accounts to test downloads, naming and reconciliation for a specified month. Check file completeness, duplicates and amounts.
- **Job application:** Use a voluntarily supplied real resume for one real vacancy and stop before submission. Check multi-step forms, attachments and missing answers.
- **Rental comparison:** Use a real set of available listings in one area and the user's constraints. Check costs and mandatory requirements. This is a candidate for the first public demonstration.

Only tested workflows should become README capability demonstrations. Screenshots must come from actual operations, with English and Chinese runs recorded separately. Label any redaction of private information; do not present invented orders, identities or prewritten answers as real tests. Source discussions establish the problem, not implementation readiness.
