---
order: 2
slug: bahia-asset
label: Bahia Asset
stmt: Automated routines that can't fail.
sub: Intern in Risk, then Operations & Tech
---

### What I wanted

At an asset manager, some routines can't fail. If a government bond trade doesn't settle, the fund has a real problem the same day. When I joined, many of these routines lived in spreadsheets and manual steps. I wanted to move them into the system, where they're faster, traceable and harder to get wrong.

### What it cost

First I had to learn the business: settlement, margin, fixed income, and how the fund, the custodian bank and the brokers fit together. Some of the work depended on the banks, so I worked with their teams on integrations, through APIs and through files.

### What I did

- **Risk (first four months):** made the R script behind the historical stress test 20% faster, so the trading desk gets its risk report sooner.
- **Operations & Tech:** replaced an Excel approval sheet with batch order approval inside the system, for bonds, futures and equities.
- Automated the matching of each repo trade to its Selic ID (the unique code Brazil's bond settlement system assigns): the system reads the Selic file and links each trade as soon as it arrives, a step that used to go through a spreadsheet.
- Connected the system to the custodian's API and files to track settlements live, during the day.
- Built a dashboard with that intraday data: what has settled, what is pending, what has gone to the broker.
- Taught the whole routine to the next intern.

### What I got

- Batch approval in daily use, replacing the spreadsheet.
- Settlement status that updates on its own during the day, instead of being checked by hand.
