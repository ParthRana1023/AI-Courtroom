# Security Policy

## Supported versions

AI Courtroom is a single live service. Only the current `main` branch and its production deployment (the web app on Vercel and the API on Render) receive security fixes. Older commits, tags and forks are not supported.

## Reporting a vulnerability

**Please do not report security issues in public GitHub issues, discussions or pull requests.**

Report them privately through GitHub instead:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Fill in the advisory form.

Only the maintainer can see the report. If you cannot use GitHub's private reporting, open an issue titled "Security contact request" with **no technical details**, and the maintainer will reply with a private channel.

A useful report includes:

- what the issue is and what an attacker could do with it;
- the affected URL, endpoint or file (for example `POST /cases/{cnr}/objections` or `server/app/routes/courtroom.py`);
- steps to reproduce, or a proof of concept;
- any accounts, case numbers or settings needed to reproduce it. Use test accounts you created yourself.

## What to expect

This is a personal project maintained by one person, so the timelines below are targets, not guarantees:

| Stage                                           | Target         |
| ----------------------------------------------- | -------------- |
| Acknowledge your report                         | within 7 days  |
| Confirm the issue, or explain why it is not one | within 14 days |
| Fix a confirmed high or critical issue          | within 30 days |

You will be kept informed while the fix is in progress. Once the fix is deployed, the advisory is published and you are credited by name or handle, unless you would rather stay anonymous.

## Scope

In scope:

- the web app and its API, including sign-in, password reset, one-time codes, Google sign-in and sessions;
- one user reading or changing another user's cases, profile, messages or uploaded files;
- prompt injection that makes the AI judge, counsel or witnesses reveal another user's data or take actions the user could not take themselves;
- secrets or personal data exposed in the repository, the client bundle, logs or API responses;
- the daily jobs endpoint, unsubscribe links and the contact form's Turnstile check.

Out of scope:

- denial of service, load or volumetric testing;
- social engineering, phishing or physical attacks;
- vulnerabilities in third-party services (Vercel, Render, MongoDB Atlas, Cloudinary, Google, Cloudflare, the LLM providers) unless our configuration of them is at fault; report those to the provider;
- the AI producing inaccurate, biased or legally wrong content, which is a quality issue, not a security one (use the in-app report button or the Contact page);
- missing security headers, cookie flags or rate limits with no demonstrated impact;
- known dependency advisories that are already listed under the repository's Dependabot alerts.

## Testing rules

- Test only against accounts and cases you created yourself.
- Do not access, change or delete other users' data. If you reach someone else's data by accident, stop, do not keep a copy, and say so in your report.
- Do not run automated scanners at a volume that degrades the service for others.
- Do not publish details until a fix is deployed or 90 days have passed since your report, whichever comes first.

Good-faith research that follows these rules will not lead to complaints or legal action from the maintainer.
