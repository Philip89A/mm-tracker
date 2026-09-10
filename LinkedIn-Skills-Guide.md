# LinkedIn Skills Guide

Skills folder: `C:\Users\phili\.claude\skills\`
Data written by the skills: `C:\Users\phili\.claude\linkedin\` (`voice.md`, `log.md`, `plan.md`)
Source repo: https://github.com/Jakeschincariol/linkedin-agent-skill

## How to start a skill

- Type the command, e.g. `/li-profile`, followed by your text or an attached file
- Or just ask in plain words ("rate my LinkedIn profile", "write a post about X"). The matching skill is picked automatically.

No skill logs into LinkedIn or posts anything. You paste text or screenshots in, and copy the result out and post it yourself.

## The skills, in a sensible order

| # | Command | What you give it | What you get back |
|---|---|---|---|
| 1 | `/li-profile` | Headline, About, current job + last two jobs, whether you have a banner and Featured section. Or a top-of-profile screenshot, or **More → Save to PDF** | Score out of 100 across 12 criteria, then rewrites of headline, About, experience, Featured and banner |
| 2 | `/li-plan` | What you offer and to whom, 3–4 topics you want to be known for, what happened this week, 10–20 people/companies you want to be seen by | Weekly plan: what to post on which day, whose posts to comment on. Saved to `C:\Users\phili\.claude\linkedin\plan.md` |
| 3 | `/li-post` | A raw idea with one specific, true detail. First time: three of your past posts | Three opening-line options, one full draft, a copy-ready block. First run creates `C:\Users\phili\.claude\linkedin\voice.md`; on "yes" the post is logged in `C:\Users\phili\.claude\linkedin\log.md` |
| 4 | `/li-human` | Any draft | Removes AI patterns (em dashes, stock phrases, invisible characters) and scores the text on 5 checks. Other skills run it automatically. Full use needs Python. |
| 5 | `/li-comment` | Someone else's post (text or screenshot), author name and role if known | Comments with a real opinion; can batch several posts for a commenting round |
| 6 | `/li-reply` | The comments under **your** post, ideally with names and roles | Comments sorted by how worth answering they are, with a draft reply to each (incl. critics and potential customers) |
| 7 | `/li-dm` | Who (name, role, company), your concrete reason to contact them now, what you want | Connection note under 200 characters, first message after acceptance, two follow-ups. Flags a reason that is too weak. |
| 8 | `/li-inbox` | A batch of messages or connection requests (text or screenshots) | Sorted into potential customers, recruiters, peers, spam etc., with replies drafted for the ones worth answering |
| 9 | `/li-carousel` | A list-style idea (steps, mistakes, comparison) | Text per slide plus HTML to print to PDF in Chrome and upload as a document post |
| 10 | `/li-repurpose` | A long piece (article, newsletter, video transcript, call notes) as text | A week of LinkedIn posts drawn from it |
| 11 | `/li-audit` | Post statistics export (**Analytics → Content → Export**) or screenshots of past posts with numbers | What worked, why, and what to stop doing, based on engagement relative to reach rather than raw views |

Each skill's full instructions: `C:\Users\phili\.claude\skills\<name>\SKILL.md`
(e.g. `C:\Users\phili\.claude\skills\li-profile\SKILL.md`)

## Getting your data in

- **Profile:** on your profile click **More → Save to PDF**, or paste the text
- **Full data export:** **Settings → Data privacy → Get a copy of your data** (ZIP of CSV files by email)
- **Post statistics:** **Analytics → Content → Export**

## A typical week after setup

- **Once:** `/li-profile`, then `/li-post` with three old posts so it learns how you write
- **Every Monday:** `/li-plan`
- **2–3 times a week:** `/li-post`
- **Daily, about 15 minutes:** `/li-comment` on 3–5 posts from people your audience follows
- **After each post:** `/li-reply` on the comments
- **Once a month:** `/li-audit`

## Setup notes

- Python is not installed yet, so `li-human`'s scripts (`detect.py`, `humanize.py`) won't run. Install from https://www.python.org/downloads/ and tick "Add to PATH".
- Skills installed during a session only appear in a new session.
